"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { useFiveSAudits } from "@/hooks/five-s/useFiveS";
import type { AuditListQuery, AuditStatus } from "@/services/five-s.service";
import {
  AuditStatusBadge,
  FilterBar,
  LevelValue,
  TargetBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
} from "@/components/five-s/ui";

function AuditList() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<AuditListQuery>({
    areaId: params.get("areaId") ?? undefined,
    status: (params.get("status") as AuditStatus | null) ?? undefined,
  });
  const { data: audits, isLoading, error, refetch } = useFiveSAudits(filters);

  return (
    <div className="space-y-section">
      <PageHeader
        title="5S audits"
        description="Drafts can be resumed and never count towards results. Submitted audits are locked."
        actions={
          <Link href="/five-s/audits/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Start an audit
          </Link>
        }
      />

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Area owner">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect
            className="w-full"
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as AuditStatus | undefined })}
          >
            <option value="">Drafts and submitted</option>
            <option value="DRAFT">Drafts only</option>
            <option value="SUBMITTED">Submitted only</option>
          </NativeSelect>
        </label>
      </FilterBar>

      {isLoading && <LoadingState label="Loading audits…" />}
      {!!error && <ErrorState description={errorMessage(error)} onRetry={() => void refetch()} />}
      {!error && audits?.length === 0 && (
        <EmptyState
          title="No audits match these filters"
          action={<Link href="/five-s/audits/new" className={buttonVariants({ variant: "outline" })}>Start an audit</Link>}
        />
      )}

      {!error && audits && audits.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <Table className="min-w-[44rem]">
            <caption className="sr-only">5S audit register</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Audit</TableHead>
                <TableHead scope="col">Area</TableHead>
                <TableHead scope="col">Audit date</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Progress or result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.map((audit) => {
                const draft = audit.status === "DRAFT";
                return (
                  <TableRow key={audit.id}>
                    <TableCell>
                      <Link
                        href={`/five-s/audits/${audit.id}`}
                        className="rounded-sm font-semibold text-primary hover:underline focus-visible:outline-ring"
                      >
                        {audit.reference}
                      </Link>
                      <p className="text-caption text-muted-foreground">
                        Auditor: {audit.auditor?.name ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal">{audit.area.name}</TableCell>
                    <TableCell>{formatDate(audit.auditDate)}</TableCell>
                    <TableCell>
                      <AuditStatusBadge status={audit.status} />
                      <p className="mt-1 text-caption text-muted-foreground">
                        {draft ? `Last saved ${formatTimestamp(audit.updatedAt)}` : `Submitted ${formatTimestamp(audit.submittedAt)}`}
                      </p>
                    </TableCell>
                    <TableCell>
                      {draft ? (
                        <div className="space-y-1">
                          <p>{audit.answered} of {audit.checkpointCount} checkpoints answered</p>
                          <Progress
                            aria-label="Checkpoints answered"
                            value={audit.answered}
                            max={Math.max(1, audit.checkpointCount)}
                          />
                          <p className="text-caption text-muted-foreground">No result until submitted</p>
                        </div>
                      ) : audit.result ? (
                        <div className="space-y-1">
                          <p><span className="tabular-nums">{audit.result.totalPoints}</span> points · Level <LevelValue level={audit.result.level} /></p>
                          <div className="flex items-center gap-2">
                            <TargetBadge met={audit.result.targetMet} />
                            <span className="text-caption text-muted-foreground">{audit.actionCount} action(s)</span>
                          </div>
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function AuditsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading audits…" />}>
      <AuditList />
    </Suspense>
  );
}
