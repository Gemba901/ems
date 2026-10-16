"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSAudits } from "@/hooks/five-s/useFiveS";
import type { AuditListQuery, AuditStatus } from "@/services/five-s.service";
import {
  AuditStatusBadge,
  EmptyState,
  ErrorNote,
  FilterBar,
  LevelValue,
  Loading,
  PageHeader,
  Surface,
  TargetBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
  primaryButton,
  selectClass,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

function AuditList() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<AuditListQuery>({
    areaId: params.get("areaId") ?? undefined,
    status: (params.get("status") as AuditStatus | null) ?? undefined,
  });
  const { data: audits, isLoading, error } = useFiveSAudits(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="5S audits"
        description="Drafts can be resumed and never count towards results. Submitted audits are locked."
        actions={
          <Link href="/five-s/audits/new" className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Start an audit
          </Link>
        }
      />

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Area owner">
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Status
          <select
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as AuditStatus | undefined })}
          >
            <option value="">Drafts and submitted</option>
            <option value="DRAFT">Drafts only</option>
            <option value="SUBMITTED">Submitted only</option>
          </select>
        </label>
      </FilterBar>

      {isLoading && <Loading label="Loading audits…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {audits && audits.length === 0 && (
        <Surface>
          <EmptyState title="No audits match these filters">
            <Link href="/five-s/audits/new" className="font-medium text-blue-700 hover:underline">
              Start an audit
            </Link>
          </EmptyState>
        </Surface>
      )}

      {audits && audits.length > 0 && (
        <ul className="space-y-3">
          {audits.map((a) => {
            const draft = a.status === "DRAFT";
            return (
              <li key={a.id}>
                <Link
                  href={`/five-s/audits/${a.id}`}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl p-4 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-row sm:items-center sm:justify-between",
                    draft ? "border-2 border-dashed border-amber-300 bg-amber-50/50 hover:border-amber-400" : "border border-slate-200 bg-white hover:border-blue-300",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{a.reference}</span>
                      <AuditStatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{a.area.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(a.auditDate)} · Auditor: {a.auditor?.name ?? "—"}
                      {draft ? ` · Last saved ${formatTimestamp(a.updatedAt)}` : ` · Submitted ${formatTimestamp(a.submittedAt)}`}
                    </p>
                  </div>
                  {draft ? (
                    <div className="w-full sm:w-48">
                      <p className="text-xs font-medium text-amber-900">
                        {a.answered} of {a.checkpointCount} checkpoints answered
                      </p>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-amber-100" aria-hidden="true">
                        <div className="h-full bg-amber-500" style={{ width: `${(a.answered / a.checkpointCount) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-amber-900">No result until submitted</p>
                    </div>
                  ) : (
                    a.result && (
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Points</p>
                          <p className="font-semibold tabular-nums">{a.result.totalPoints}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Level</p>
                          <LevelValue level={a.result.level} className="text-lg" />
                        </div>
                        <TargetBadge met={a.result.targetMet} />
                        <span className="text-xs text-slate-500">{a.actionCount} action(s)</span>
                      </div>
                    )
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function AuditsPage() {
  return (
    <Suspense fallback={<Loading label="Loading audits…" />}>
      <AuditList />
    </Suspense>
  );
}
