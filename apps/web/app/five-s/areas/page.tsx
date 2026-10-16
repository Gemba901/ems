"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useFiveSAreas, useFiveSCapabilities } from "@/hooks/five-s/useFiveS";
import { formatLevel } from "@/lib/five-s/scoring";
import { AUDIT_FREQUENCY_LABELS, type AreaStatusFilter } from "@/services/five-s.service";
import {
  AuditDueBadge,
  DepartmentSelect,
  EmptyState,
  ErrorNote,
  LevelValue,
  Loading,
  PageHeader,
  PersonSelect,
  SampleBadge,
  Surface,
  TargetBadge,
  errorMessage,
  formatDate,
  primaryButton,
  selectClass,
} from "@/components/five-s/ui";

export default function AreasPage() {
  const [filters, setFilters] = useState<{ departmentId?: string; ownerId?: string; status: AreaStatusFilter }>({ status: "active" });
  const { data: areas, isLoading, error } = useFiveSAreas(filters);
  const { data: caps } = useFiveSCapabilities();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workplace areas"
        description="Each area shows its latest submitted audit. Areas without one are Not assessed."
        actions={
          caps?.canCreateAreas && (
            <Link href="/five-s/areas/new" className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New area
            </Link>
          )
        }
      />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Department
          <DepartmentSelect id="areas-dept" value={filters.departmentId} onChange={(v) => setFilters({ ...filters, departmentId: v ?? undefined })} emptyLabel="All departments" />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Owner
          <PersonSelect id="areas-owner" value={filters.ownerId} onChange={(v) => setFilters({ ...filters, ownerId: v ?? undefined })} emptyLabel="Anyone" />
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Status
          <select className={selectClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as AreaStatusFilter })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {isLoading && <Loading label="Loading areas…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {areas && areas.length === 0 && (
        <Surface>
          <EmptyState title="No workplace areas yet">
            {caps?.canCreateAreas ? "Create an area to start auditing it." : "Ask a 5S administrator or your HOD to set up areas."}
          </EmptyState>
        </Surface>
      )}

      {areas && areas.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {areas.map((a) => (
            <li key={a.id}>
              <Link
                href={`/five-s/areas/${a.id}`}
                className="block h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {a.department?.name ?? "No department"} · Owner: {a.owner?.name ?? "not set"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a.isSample && <SampleBadge />}
                    {!a.isActive && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">Inactive</span>}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Level</dt>
                    <dd className="mt-0.5 text-lg">
                      <LevelValue level={a.latest?.level} className="text-lg" />
                    </dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Target</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{formatLevel(a.targetLevel)}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">Points</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{a.latest ? a.latest.totalPoints : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.latest && <TargetBadge met={a.targetMet} />}
                  {a.isActive && <AuditDueBadge state={a.auditDue.state} nextDueDate={a.auditDue.nextDueDate} />}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {AUDIT_FREQUENCY_LABELS[a.auditFrequency]} audits · Last: {a.latest ? formatDate(a.latest.auditDate) : "never"} ·{" "}
                  {a.counts.openActions + a.counts.awaitingVerification} outstanding action(s)
                  {a.counts.overdueActions > 0 && <span className="font-semibold text-red-700"> · {a.counts.overdueActions} overdue</span>} ·{" "}
                  {a.counts.pendingRedTags} pending red tag(s)
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
