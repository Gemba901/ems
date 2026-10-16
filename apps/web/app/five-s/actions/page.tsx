"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSActions } from "@/hooks/five-s/useFiveS";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { ACTION_STATUS_LABELS, type ActionListQuery, type ActionListView, type ActionStatus, type Practice } from "@/services/five-s.service";
import {
  ActionStatusBadge,
  DueDate,
  EmptyState,
  ErrorNote,
  FilterBar,
  Loading,
  PageHeader,
  PracticeBadge,
  Surface,
  errorMessage,
  primaryButton,
  selectClass,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

const VIEWS: { value: ActionListView | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "mine", label: "My actions" },
  { value: "to_verify", label: "To verify" },
  { value: "overdue", label: "Overdue" },
  { value: "no_due_date", label: "Due date not set" },
];

function ActionList() {
  const params = useSearchParams();
  const [view, setView] = useState<ActionListView | "">((params.get("view") as ActionListView | null) ?? "");
  const [filters, setFilters] = useState<ActionListQuery>({
    areaId: params.get("areaId") ?? undefined,
    auditId: params.get("auditId") ?? undefined,
    status: (params.get("status") as ActionStatus | null) ?? undefined,
  });
  const { data: actions, isLoading, error } = useFiveSActions({ ...filters, view: view || undefined });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Improvement actions"
        description="One action per checkpoint with problem locations, plus any raised manually. Open → Awaiting verification → Verified. Closing an action never changes an audit score."
        actions={
          <Link href={`/five-s/actions/new${filters.areaId ? `?areaId=${filters.areaId}` : ""}`} className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New action
          </Link>
        }
      />

      <div role="tablist" aria-label="Action views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => setView(v.value)}
            className={cn(
              "min-h-9 rounded-full px-3 text-sm font-medium",
              view === v.value ? "bg-blue-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Action owner">
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Status
          <select
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as ActionStatus | undefined })}
          >
            <option value="">Any status</option>
            {(Object.keys(ACTION_STATUS_LABELS) as ActionStatus[]).map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          S
          <select
            className={selectClass}
            value={filters.practice ?? ""}
            onChange={(e) => setFilters({ ...filters, practice: (e.target.value || undefined) as Practice | undefined })}
          >
            <option value="">All five</option>
            {PRACTICE_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRACTICE_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      {filters.auditId && (
        <p className="text-sm text-slate-600">
          Showing actions from one audit.{" "}
          <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setFilters({ ...filters, auditId: undefined })}>
            Show all
          </button>
        </p>
      )}

      {isLoading && <Loading label="Loading actions…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {actions && actions.length === 0 && (
        <Surface>
          <EmptyState title="No actions match these filters" />
        </Surface>
      )}
      {actions && actions.length > 0 && (
        <Surface>
          <ul className="divide-y divide-slate-100">
            {actions.map((a) => (
              <li key={a.id}>
                <Link href={`/five-s/actions/${a.id}`} className="block px-5 py-4 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{a.reference}</span>
                    <PracticeBadge practice={a.practice} />
                    <ActionStatusBadge status={a.status} />
                    {a.source === "MANUAL" && <span className="text-xs text-slate-500">Manual</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">{a.finding}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{a.area.name}</span>
                    {a.audit && (
                      <span>
                        · {a.audit.reference}
                        {a.checkpointNo ? `, checkpoint ${a.checkpointNo}` : ""}
                      </span>
                    )}
                    <span>· Owner: {a.owner?.name ?? "not assigned"}</span>
                    <span>·</span>
                    <DueDate date={a.dueDate} overdue={a.isOverdue} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function ActionsPage() {
  return (
    <Suspense fallback={<Loading label="Loading actions…" />}>
      <ActionList />
    </Suspense>
  );
}
