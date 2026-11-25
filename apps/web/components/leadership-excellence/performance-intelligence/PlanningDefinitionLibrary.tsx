"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { PerformanceIntelligenceService } from "@/services/leadership-excellence/performance-intelligence.service";
import {
  PlanningApiError,
  type KpiDefinition,
} from "@/services/leadership-excellence/performance-planning.service";
import type {
  LibraryCommand,
  LibraryEntry,
  LibraryView,
} from "@/services/leadership-excellence/performance-intelligence/library";
import { calendarDateLabel } from "@/services/leadership-excellence/calendar-display";
import { planningFrequencies } from "@/services/leadership-excellence/performance-planning/calendar-options";
import {
  Button,
  card,
  control,
  Field,
} from "../performance-planning/PlanningUi";
import { LibraryDecision, LibraryEditor } from "./LibraryEditor";
import { sameLibraryIdentity } from "@/services/leadership-excellence/performance-intelligence/library-conflicts";

const directions: Record<KpiDefinition["direction"], string> = {
  HIGHER: "Higher is better",
  LOWER: "Lower is better",
  RANGE: "Within the agreed range",
  ZERO: "Zero is the target",
  MILESTONE: "Milestone achieved",
};
const summaries: Record<KpiDefinition["aggregation"], string> = {
  SUM: "Sum of recorded values",
  RATIO: "Combined source figures, then calculate the ratio",
  CLOSING: "Closing value for the period",
  MILESTONE: "Milestone completion",
};
const statusLabels = {
  REFERENCE: "Reference example",
  DRAFT: "Draft",
  IN_REVIEW: "Under review",
  APPROVED: "Approved",
};
type Editor = {
  data: LibraryView;
  entry?: LibraryEntry;
  mode: "EDIT" | "ADAPT" | "SUBMIT" | "APPROVE" | "RETURN" | "REVISE";
};

function DefinitionFacts({ definition }: { definition: KpiDefinition }) {
  const formula =
    definition.formula === "DIRECT"
      ? definition.inputA || "Direct reading"
      : `(${definition.inputA || "A"} ÷ ${definition.inputB || "B"})${definition.formula === "PERCENT" ? " × 100" : ""}`;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-slate-600">
        {definition.meaning || "Meaning not entered yet."}
      </p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {[
          ["Calculation & required figures", formula],
          ["Unit", definition.unit],
          ["Performance direction", directions[definition.direction]],
          ["Period summary", summaries[definition.aggregation]],
          ["Suitable data source", definition.dataSource],
          [
            "Suggested reporting frequency",
            planningFrequencies.find(
              ([key]) => key === definition.suggestedFrequency,
            )?.[1] || "Choose in the plan",
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="mt-1 break-words font-medium">
              {value || "Not entered"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PlanningDefinitionLibrary() {
  const user = useAuthStore((state) => state.user);
  return (
    <LibraryWorkspace
      key={JSON.stringify([
        user?.organizationId,
        user?.userId,
        user?.roleLevel,
        user?.roleId,
      ])}
    />
  );
}

function LibraryWorkspace() {
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const queryKey = useMemo(
    () => [
      "lex-definition-library",
      user?.organizationId,
      user?.userId,
      user?.roleLevel,
      user?.roleId,
    ],
    [user?.organizationId, user?.userId, user?.roleLevel, user?.roleId],
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      PerformanceIntelligenceService.getLibrary(token!, signal),
    enabled: !!token && !!user?.organizationId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: (count, error) =>
      !(
        error instanceof PlanningApiError && [401, 403].includes(error.status)
      ) && count < 2,
  });
  useEffect(() => {
    if (!user?.organizationId || typeof BroadcastChannel === "undefined")
      return;
    const channel = new BroadcastChannel("gemba-performance-planning");
    channel.onmessage = (event) => {
      if (event.data?.organizationId === user.organizationId)
        void client.invalidateQueries({ queryKey, exact: true });
    };
    return () => channel.close();
  }, [client, queryKey, user?.organizationId]);

  function assertCurrentIdentity() {
    const current = useAuthStore.getState();
    if (!current.accessToken || !sameLibraryIdentity(user, current.user))
      throw new Error(
        "Your account or organisation changed. Reopen the library in the current workspace.",
      );
  }

  async function refreshLibrary(): Promise<LibraryView> {
    assertCurrentIdentity();
    await client.cancelQueries({ queryKey, exact: true });
    assertCurrentIdentity();
    const latest = await PerformanceIntelligenceService.getLibrary(token!);
    assertCurrentIdentity();
    await client.cancelQueries({ queryKey, exact: true });
    assertCurrentIdentity();
    client.setQueryData(queryKey, latest);
    return latest;
  }

  async function save(command: LibraryCommand) {
    if (!token || saving.current)
      throw new Error("Wait for the current request to finish.");
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      await client.cancelQueries({ queryKey, exact: true });
      assertCurrentIdentity();
      const result = await PerformanceIntelligenceService.libraryCommand(
        token,
        command,
      );
      await client.cancelQueries({ queryKey, exact: true });
      assertCurrentIdentity();
      client.setQueryData(queryKey, result);
      void client.invalidateQueries({
        queryKey: ["lex-performance-planning", user?.organizationId],
      });
      void client.invalidateQueries({
        queryKey: ["lex-definition-catalogue", user?.organizationId],
      });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("gemba-performance-planning");
        channel.postMessage({
          type: "workspace-changed",
          organizationId: user?.organizationId,
          revision: result.revision,
        });
        channel.close();
      }
      setMessage(
        {
          SAVE_DRAFT: "Definition saved as draft.",
          SUBMIT: "Sent to the designated approver.",
          APPROVE: "Definition approved and locked.",
          RETURN: "Returned for changes.",
          REVISE:
            "Revision opened. The previous approved version is preserved.",
        }[command.action],
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (query.isPending || !token)
    return (
      <div
        role="status"
        className="flex min-h-60 items-center justify-center gap-3 text-slate-500"
      >
        <Loader2 size={20} className="animate-spin" /> Loading KRA &amp; KPI
        library…
      </div>
    );
  const denied =
    query.error instanceof PlanningApiError &&
    [401, 403].includes(query.error.status);
  if (!query.data || denied)
    return (
      <section className={card}>
        <h1 className="text-xl font-semibold">KRA &amp; KPI libraries</h1>
        <p role="alert" className="my-4 text-red-700">
          {query.error?.message || "The library could not be loaded."}
        </p>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={16} /> Try again
        </Button>
      </section>
    );
  const data = query.data;
  const term = search.trim().toLowerCase();
  const kraGroups = [
    ...data.kras,
    { id: "", code: "", name: "KRA not selected yet" },
  ];
  const groups = kraGroups
    .map((kra) => ({
      ...kra,
      entries: data.entries.filter(
        (entry) =>
          entry.definition.kraId === kra.id &&
          (!status || entry.status === status) &&
          [
            entry.definition.name,
            entry.definition.code,
            entry.definition.meaning,
            kra.name,
          ].some((text) => text.toLowerCase().includes(term)),
      ),
    }))
    .filter((group) => group.entries.length);
  const matchCount = groups.reduce(
    (sum, group) => sum + group.entries.length,
    0,
  );
  const open = (mode: Editor["mode"], entry?: LibraryEntry) => {
    setMessage("");
    setEditor({ mode, entry, data });
  };
  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            KRA &amp; KPI libraries
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Shared definitions for Performance Planning. Each plan sets its own
            targets, people and calendar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={busy || query.isFetching}
          >
            <RefreshCw
              size={16}
              className={query.isFetching ? "animate-spin" : ""}
            />{" "}
            Refresh
          </Button>
          {data.canEdit && (
            <Button onClick={() => open("EDIT")} disabled={busy}>
              <Plus size={16} /> New KPI definition
            </Button>
          )}
        </div>
      </div>
      {query.isError && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Could not refresh. These definitions may be out of date; use Refresh
          to try again.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      <section className={`${card} space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <Field label="Search definitions">
            <input
              type="search"
              className={control}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="KRA, KPI name, code or meaning"
            />
          </Field>
          <Field label="Status">
            <select
              className={control}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All visible definitions</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p aria-live="polite" className="text-sm text-slate-500">
          {matchCount} of {data.entries.length} definitions · {groups.length}{" "}
          responsibility areas
        </p>
      </section>
      <p className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm text-slate-600">
        Reference examples are suggestions. Submit an organisation definition
        for review before it becomes an approved reusable definition. Approved
        plans retain the version used at approval.
      </p>
      {groups.map((group) => (
        <section
          key={group.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
            <BookOpen size={20} className="shrink-0 text-indigo-600" />
            <div>
              <h2 className="font-semibold">{group.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {group.code ? `${group.code} · ` : ""}
                {group.entries.length} KPIs
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {group.entries.map((entry) => (
              <details key={entry.definition.id} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 focus-visible:outline-indigo-500 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1 basis-48">
                    <h3 className="font-medium">
                      {entry.definition.name || "Untitled KPI draft"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.definition.code}
                      {entry.definition.unit
                        ? ` · ${entry.definition.unit}`
                        : ""}
                      {entry.approvedVersion
                        ? entry.status === "DRAFT" ||
                          entry.status === "IN_REVIEW"
                          ? ` · Last approved v${entry.approvedVersion}`
                          : ` · v${entry.approvedVersion}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${entry.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : entry.status === "IN_REVIEW" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}
                  >
                    {statusLabels[entry.status]}
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="space-y-4 border-t border-slate-100 px-4 pb-5 pt-4 sm:px-6">
                  {entry.effectiveDate && (
                    <p className="text-xs text-slate-500">
                      Effective {calendarDateLabel(entry.effectiveDate)}
                      {entry.activeVersion
                        ? ` · Active approved version: ${entry.activeVersion}`
                        : entry.status === "APPROVED"
                          ? " · Not effective yet"
                          : ""}
                    </p>
                  )}
                  <DefinitionFacts definition={entry.definition} />
                  {entry.definition.adaptedFromId && (
                    <p className="text-xs text-slate-500">
                      Adapted from{" "}
                      {data.entries.find(
                        (item) =>
                          item.definition.id === entry.definition.adaptedFromId,
                      )?.definition.code || entry.definition.adaptedFromId}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {entry.permissions.canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => open("EDIT", entry)}
                      >
                        Edit draft
                      </Button>
                    )}
                    {entry.permissions.canSubmit && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => open("SUBMIT", entry)}
                      >
                        Send for review
                      </Button>
                    )}
                    {entry.permissions.canApprove && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => open("APPROVE", entry)}
                      >
                        Approve
                      </Button>
                    )}
                    {entry.permissions.canReturn && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => open("RETURN", entry)}
                      >
                        Return for changes
                      </Button>
                    )}
                    {entry.permissions.canRevise && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => open("REVISE", entry)}
                      >
                        Revise
                      </Button>
                    )}
                    {entry.permissions.canAdapt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => open("ADAPT", entry)}
                      >
                        Adapt as new KPI
                      </Button>
                    )}
                  </div>
                  {(entry.versions.length > 0 || entry.history.length > 0) && (
                    <details className="rounded-lg border border-slate-100 p-3">
                      <summary className="cursor-pointer text-sm text-slate-600">
                        Versions &amp; history
                      </summary>
                      <div className="mt-3 space-y-4">
                        {entry.versions.map((version) => (
                          <details
                            key={version.version}
                            className="rounded-lg bg-slate-50 p-3"
                          >
                            <summary className="cursor-pointer text-sm font-medium">
                              Version {version.version} · Effective{" "}
                              {calendarDateLabel(version.effectiveDate)}
                            </summary>
                            <p className="my-3 text-xs text-slate-500">
                              Approved by {version.approvedByName} ·{" "}
                              {version.approvedAt
                                ? new Date(version.approvedAt).toLocaleString()
                                : ""}
                              {version.reason ? ` · ${version.reason}` : ""}
                            </p>
                            <DefinitionFacts definition={version.definition} />
                          </details>
                        ))}
                        {entry.history.length > 0 && (
                          <ol className="space-y-2 text-xs text-slate-500">
                            {entry.history.map((event) => (
                              <li key={event.id}>
                                <span className="font-medium text-slate-700">
                                  {event.action}
                                </span>{" "}
                                · {event.actorName} ·{" "}
                                {new Date(event.at).toLocaleString()}
                                {event.detail ? ` — ${event.detail}` : ""}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
      {!matchCount && (
        <div className={`${card} text-center`}>
          <h2 className="font-semibold">
            {data.entries.length
              ? "No matching definitions"
              : "No approved definitions yet"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {data.entries.length
              ? "Try a different search or status."
              : data.canEdit
                ? "Create a KPI definition to start your library."
                : "Approved definitions will appear here when your organisation publishes them."}
          </p>
        </div>
      )}
      <Link
        href="/leadership-excellence/performance-planning/department-plans"
        className="inline-flex items-center gap-2 rounded-lg px-1 py-2 text-sm font-medium text-indigo-700 hover:underline"
      >
        Open performance planning <ArrowRight size={16} />
      </Link>
      {editor &&
        (editor.mode === "EDIT" || editor.mode === "ADAPT" ? (
          <LibraryEditor
            data={editor.data}
            entry={editor.entry}
            adapt={editor.mode === "ADAPT"}
            save={save}
            refreshLibrary={refreshLibrary}
            onClose={() => setEditor(null)}
          />
        ) : (
          editor.entry && (
            <LibraryDecision
              data={editor.data}
              entry={editor.entry}
              action={editor.mode}
              save={save}
              refreshLibrary={refreshLibrary}
              onClose={() => setEditor(null)}
            />
          )
        ))}
    </div>
  );
}
