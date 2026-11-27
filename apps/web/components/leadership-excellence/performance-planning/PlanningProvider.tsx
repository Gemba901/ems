"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import {
  PerformancePlanningService,
  PlanningApiError,
  type PlanningCommand,
  type PlanningView,
  type ParentGoal,
} from "@/services/leadership-excellence/performance-planning.service";
import { Button } from "./PlanningUi";
import { Loader2, RefreshCw } from "lucide-react";
import { useLexPlanningPeriod } from "../LexPlanningPeriod";
import { Button as UiButton } from "@/components/ui/button";

type PlanningContext = {
  data: PlanningView;
  busy: boolean;
  planningCycle: string;
  setPlanningCycle: (cycle: string) => void;
  planFocus: string;
  setPlanFocus: (id: string) => void;
  registerFocus: { documentId: string; itemId: string } | null;
  setRegisterFocus: (
    value: { documentId: string; itemId: string } | null,
  ) => void;
  contributionContext: {
    cycle: string;
    departmentId: string;
    parent: ParentGoal;
  } | null;
  setContributionContext: (
    value: { cycle: string; departmentId: string; parent: ParentGoal } | null,
  ) => void;
  run: (
    action: PlanningCommand["action"],
    payload: Record<string, unknown>,
    documentId?: string,
    expectedRevision?: number,
  ) => Promise<string>;
  refresh: () => void;
};
const Context = createContext<PlanningContext | null>(null);
export function usePlanning() {
  const context = useContext(Context);
  if (!context) throw new Error("PlanningProvider is required");
  return context;
}
export function PlanningProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.accessToken);
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const userId = useAuthStore((state) => state.user?.userId);
  const role = useAuthStore((state) => state.user?.roleLevel);
  const client = useQueryClient();
  const key = useMemo(
    () => ["lex-performance-planning", organizationId, userId, role],
    [organizationId, userId, role],
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      PerformancePlanningService.getWorkspace(token!, signal),
    enabled: !!token,
    staleTime: 0,
    // Other users/devices are checked while this workspace is visible.
    // Same-browser approvals additionally notify other tabs immediately.
    refetchInterval: busy ? false : 10_000,
    refetchOnWindowFocus: true,
    retry: (failures, cause) =>
      !(
        cause instanceof PlanningApiError && [401, 403].includes(cause.status)
      ) && failures < 2,
  });
  useEffect(() => {
    if (!organizationId || !token || typeof BroadcastChannel === "undefined")
      return;
    const connection = new BroadcastChannel("gemba-performance-planning");
    channel.current = connection;
    connection.onmessage = (event) => {
      const change = event.data;
      if (
        change?.type !== "workspace-changed" ||
        change.organizationId !== organizationId ||
        !Number.isInteger(change.revision)
      )
        return;
      const current = client.getQueryData<PlanningView>(key);
      if (current && current.revision >= change.revision) return;
      // The event carries no plan data. Each role reloads its authorised view.
      void client.invalidateQueries({ queryKey: key, exact: true });
    };
    return () => {
      connection.close();
      if (channel.current === connection) channel.current = null;
    };
  }, [client, key, organizationId, token]);
  const { cycle: planningCycle, setCycle: setPlanningCycle } =
    useLexPlanningPeriod();
  useEffect(() => {
    if (!planningCycle && query.data)
      setPlanningCycle(
        query.data.documents.at(-1)?.cycle || String(new Date().getFullYear()),
      );
  }, [planningCycle, query.data, setPlanningCycle]);
  const [focus, setFocus] = useState<{
    organizationId: typeof organizationId;
    plan: string;
    register: PlanningContext["registerFocus"];
  }>({ organizationId, plan: "", register: null });
  const [handoff, setHandoff] = useState<{
    organizationId: typeof organizationId;
    value: PlanningContext["contributionContext"];
  }>({ organizationId, value: null });
  const [message, setMessage] = useState("");
  const [messageHref, setMessageHref] = useState("");
  const [error, setError] = useState("");
  async function run(
    action: PlanningCommand["action"],
    payload: Record<string, unknown>,
    documentId?: string,
    expectedRevision?: number,
  ) {
    if (!query.data || !token || saving.current)
      throw new Error("Wait for the current request to finish.");
    saving.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setMessageHref("");
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      const result = await PerformancePlanningService.command(token, {
        action,
        payload,
        documentId,
        // Editors pin their opening revision. A background refresh must never
        // silently bless an older form with the latest workspace revision.
        expectedRevision: expectedRevision ?? query.data.revision,
      });
      // A GET begun before approval must not overwrite the approved response.
      await client.cancelQueries({ queryKey: key, exact: true });
      client.setQueryData(key, result);
      if (action === "SAVE_GOALS") {
        const saved = result.documents.find((d) => d.id === documentId);
        console.info("[EMS-DEBUG] SAVE_GOALS response", {
          documentId,
          goals: saved?.data.goals.map((g) => g.id),
          assignments: saved?.data.assignments.map((a) => ({
            id: a.id,
            goalId: a.goalId,
            definitionId: a.definitionId,
          })),
        });
      }
      channel.current?.postMessage({
        type: "workspace-changed",
        organizationId,
        revision: result.revision,
      });
      setMessage(
        action === "REVIEW_FINDING"
          ? payload.status === "REVIEWED"
            ? "Finding reviewed. It is ready to link to an objective."
            : payload.status === "NEEDS_EVIDENCE"
              ? "Evidence request saved with the finding."
              : "Finding review saved."
          : action === "APPROVE"
            ? "Approved version saved and locked."
            : action === "SUBMIT"
              ? "Plan submitted to its designated approver."
              : action === "CONSIDER_ALL_PILLARS"
                ? "All 6 pillars marked as considered."
                : "Changes saved successfully.",
      );
      if (action === "REVIEW_FINDING" && typeof payload.id === "string")
        setMessageHref(
          `/leadership-excellence/performance-planning/swot-findings?finding=${encodeURIComponent(payload.id)}`,
        );
      return result.focusId;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save your changes.",
      );
      throw cause;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <div
        className="flex min-h-60 items-center justify-center gap-3 text-muted-foreground"
        role="status"
      >
        <Loader2 className="animate-spin" size={20} />
        Loading performance planning…
      </div>
    );
  const transientRefreshFailure =
    query.isError &&
    (!(query.error instanceof PlanningApiError) ||
      query.error.status >= 500 ||
      [408, 429].includes(query.error.status));
  // A failed background refresh must not unmount an in-progress editor.
  // Authentication/permission failures still hide cached confidential content.
  if (!query.data || (query.isError && !transientRefreshFailure))
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">
          Performance Planning &amp; Alignment
        </h1>
        <p className="my-4 text-destructive" role="alert">
          {query.error?.message ||
            "Your planning workspace could not be loaded."}
        </p>
        <Button onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          Try again
        </Button>
      </section>
    );
  return (
    <Context.Provider
      value={{
        data: query.data,
        busy,
        planningCycle,
        setPlanningCycle,
        planFocus: focus.organizationId === organizationId ? focus.plan : "",
        setPlanFocus: (plan) =>
          setFocus((current) => ({
            organizationId,
            plan,
            register:
              current.organizationId === organizationId
                ? current.register
                : null,
          })),
        registerFocus:
          focus.organizationId === organizationId ? focus.register : null,
        setRegisterFocus: (register) =>
          setFocus((current) => ({
            organizationId,
            register,
            plan: current.organizationId === organizationId ? current.plan : "",
          })),
        contributionContext:
          handoff.organizationId === organizationId ? handoff.value : null,
        setContributionContext: (value) =>
          setHandoff({ organizationId, value }),
        run,
        refresh: () => {
          setError("");
          if (!saving.current) void query.refetch();
        },
      }}
    >
      <div className="space-y-5">
        {transientRefreshFailure && (
          <div
            role="alert"
            className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning"
          >
            <p>
              Could not refresh the register. Your open form and unsaved entries
              are preserved; the displayed records may be out of date.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={16} /> Retry refresh
            </Button>
          </div>
        )}
        {message && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success"
          >
            <span>
              {message}{" "}
              {messageHref && (
                <Link href={messageHref} className="font-semibold underline">
                  View finding
                </Link>
              )}
            </span>
            <UiButton variant="ghost"
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss success message"
            >
              ×
            </UiButton>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <p className="whitespace-pre-line">{error}</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => {
                setError("");
                void query.refetch();
              }}
            >
              Refresh register
            </Button>
          </div>
        )}
        {children}
      </div>
    </Context.Provider>
  );
}
