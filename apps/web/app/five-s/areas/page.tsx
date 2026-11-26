"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import Link from "next/link";
import { useFiveSAreas } from "@/hooks/five-s/useFiveS";
import { formatLevel } from "@/lib/five-s/scoring";
import { AUDIT_FREQUENCY_LABELS, type AreaStatusFilter } from "@/services/five-s.service";
import {
  AuditDueBadge,
  DepartmentSelect,
  LevelValue,
  PersonSelect,
  SampleBadge,
  TargetBadge,
  errorMessage,
  formatDate,
} from "@/components/five-s/ui";

export default function AreasPage() {
  const [filters, setFilters] = useState<{ departmentId?: string; ownerId?: string; status: AreaStatusFilter }>({ status: "active" });
  const { data: areas, isLoading, error } = useFiveSAreas(filters);

  return (
    <div className="space-y-section">
      <PageHeader
        title="Workplace areas"
        description="Areas come from the Work Area / Section on employee profiles. Each shows its latest submitted audit; areas without one are Not assessed."
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Department
          <DepartmentSelect id="areas-dept" value={filters.departmentId} onChange={(v) => setFilters({ ...filters, departmentId: v ?? undefined })} emptyLabel="All departments" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Owner
          <PersonSelect id="areas-owner" value={filters.ownerId} onChange={(v) => setFilters({ ...filters, ownerId: v ?? undefined })} emptyLabel="Anyone" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect className="w-full" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as AreaStatusFilter })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </NativeSelect>
        </label>
      </div>

      {isLoading && <LoadingState label="Loading areas…" />}
      {!!error && <ErrorState description={errorMessage(error)} />}
      {areas && areas.length === 0 && (
        <Card className="block py-0">
          <EmptyState title="No workplace areas yet" description="Areas are built from the Work Area / Section on employee profiles. Fill in that field for your employees and their areas appear here." />
        </Card>
      )}

      {areas && areas.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {areas.map((a) => (
            <li key={a.id}>
              <Link
                href={`/five-s/areas/${a.id}`}
                className="block h-full rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.department?.name ?? "No department"} · Owner: {a.owner?.name ?? "not set"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a.isSample && <SampleBadge />}
                    {!a.isActive && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">Inactive</span>}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</dt>
                    <dd className="mt-0.5 text-lg">
                      <LevelValue level={a.latest?.level} className="text-lg" />
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Target</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{formatLevel(a.targetLevel)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Points</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{a.latest ? a.latest.totalPoints : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {a.latest && <TargetBadge met={a.targetMet} />}
                  {a.isActive && <AuditDueBadge state={a.auditDue.state} nextDueDate={a.auditDue.nextDueDate} />}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {AUDIT_FREQUENCY_LABELS[a.auditFrequency]} audits · Last: {a.latest ? formatDate(a.latest.auditDate) : "never"} ·{" "}
                  {a.counts.openActions + a.counts.awaitingVerification} outstanding action(s)
                  {a.counts.overdueActions > 0 && <span className="font-semibold text-danger"> · {a.counts.overdueActions} overdue</span>} ·{" "}
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
