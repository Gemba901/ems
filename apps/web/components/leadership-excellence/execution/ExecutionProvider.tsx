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
import { Loader2, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  ExecutionApiError,
  ExecutionService,
  type ExecutionCommand,
  type ExecutionView,
} from "@/services/leadership-excellence/execution.service";
import { Button, card } from "../performance-planning/PlanningUi";

interface ContextValue {
  data: ExecutionView;
  busy: boolean;
  run: (
    action: ExecutionCommand["action"],
    payload: Record<string, unknown>,
    revision?: number,
  ) => Promise<ExecutionView>;
  refresh: () => Promise<ExecutionView | undefined>;
  setUnsaved: (value: boolean) => void;
  confirmNavigation: () => boolean;
}
const Context = createContext<ContextValue | null>(null);
export function useExecution() {
  const context = useContext(Context);
  if (!context) throw new Error("ExecutionProvider is required.");
  return context;
}

export function ExecutionProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const key = useMemo(
    () => [
      "lex-execution",
      user?.organizationId,
      user?.userId,
      user?.roleLevel,
    ],
    [user?.organizationId, user?.userId, user?.roleLevel],
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const unsaved = useRef(false);
  const confirmNavigation = () =>
    !unsaved.current ||
    window.confirm("You have unsaved entries. Leave without saving them?");
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        !unsaved.current ||
        event.defaultPrevented ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      if (
        link.href !== window.location.href &&
        !window.confirm("You have unsaved entries. Leave without saving them?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => ExecutionService.getWorkspace(token!, signal),
    enabled: !!token,
    staleTime: 0,
    refetchInterval: busy ? false : 15_000,
    refetchOnWindowFocus: true,
    retry: (count, error) =>
      !(
        error instanceof ExecutionApiError && [401, 403].includes(error.status)
      ) && count < 2,
  });
  useEffect(() => {
    if (!user?.organizationId || typeof BroadcastChannel === "undefined")
      return;
    const channels = [
      "gemba-performance-planning",
      "gemba-performance-execution",
    ].map((name) => {
      const channel = new BroadcastChannel(name);
      channel.onmessage = (event) => {
        if (event.data?.organizationId === user.organizationId)
          void queryClient.invalidateQueries({ queryKey: key, exact: true });
      };
      return channel;
    });
    return () => channels.forEach((channel) => channel.close());
  }, [key, queryClient, user?.organizationId]);

  async function run(
    action: ExecutionCommand["action"],
    payload: Record<string, unknown>,
    revision?: number,
  ) {
    if (!token || !query.data || saving.current)
      throw new Error("Wait for the current request to finish.");
    saving.current = true;
    setBusy(true);
    try {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const result = await ExecutionService.command(token, {
        action,
        payload,
        expectedRevision: revision ?? query.data.revision,
      });
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, result);
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("gemba-performance-execution");
        channel.postMessage({
          type: "workspace-changed",
          organizationId: user?.organizationId,
        });
        channel.close();
      }
      return result;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <div
        role="status"
        className="flex min-h-64 items-center justify-center gap-3 text-slate-500"
      >
        <Loader2 size={20} className="animate-spin" />
        Loading your approved work…
      </div>
    );
  const denied =
    query.error instanceof ExecutionApiError &&
    [401, 403].includes(query.error.status);
  if (!query.data || denied)
    return (
      <section className={card}>
        <h1 className="text-xl font-semibold">Performance execution</h1>
        <p role="alert" className="my-4 whitespace-pre-line text-red-700">
          {query.error?.message || "Your workspace could not be loaded."}
        </p>
        <Button onClick={() => void query.refetch()} variant="outline">
          <RefreshCw size={16} />
          Try again
        </Button>
      </section>
    );
  return (
    <Context.Provider
      key={key.join(":")}
      value={{
        data: query.data,
        busy,
        run,
        refresh: async () => (await query.refetch()).data,
        setUnsaved: (value) => {
          unsaved.current = value;
        },
        confirmNavigation,
      }}
    >
      {query.isError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Could not refresh the workspace. Your entries are still here.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
