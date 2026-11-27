"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import Link from "next/link";
import { useFiveSOverview } from "@/hooks/five-s/useFiveS";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { formatLevel } from "@/lib/five-s/scoring";
import type { AreaStatusFilter, OverviewQuery } from "@/services/five-s.service";
import {
  AuditDueBadge,
  FilterBar,
  LevelValue,
  SampleBadge,
  StatCard,
  TargetBadge,
  errorMessage,
  formatDate,
} from "@/components/five-s/ui";

export default function FiveSOverviewPage() {
  const [filters, setFilters] = useState<OverviewQuery>({ status: "active" });
  const { data, isLoading, error } = useFiveSOverview(filters);

  return (
    <div className="space-y-section">
      <PageHeader
        title="5S Overview"
        description="Key 1 of the 20 Keys: Cleaning and Organising to Make Work Easy. Only submitted audits count; drafts are excluded."
        actions={
          <>
            <Link href="/five-s/audits/new" className={buttonVariants()}>
              Start an audit
            </Link>
          </>
        }
      />

      <FilterBar value={filters} onChange={setFilters}>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Area status
          <NativeSelect
            className="w-full"
            value={filters.status ?? "active"}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as AreaStatusFilter })}
          >
            <option value="active">Active areas</option>
            <option value="inactive">Inactive areas</option>
            <option value="all">All areas</option>
          </NativeSelect>
        </label>
      </FilterBar>

      {isLoading && <LoadingState label="Loading overview…" />}
      {!!error && <ErrorState description={errorMessage(error)} />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Areas assessed" value={`${data.totals.assessed} / ${data.totals.areas}`} hint={`${data.totals.notAssessed} not assessed`} href="/five-s/areas" />
            <StatCard
              label="Target met"
              value={`${data.totals.targetMet} / ${data.totals.assessed}`}
              hint={`${data.totals.targetNotMet} below target`}
              tone={data.totals.targetNotMet ? "warn" : "good"}
            />
            <StatCard label="Open actions" value={data.totals.openActions} hint={`${data.totals.actionsWithoutDueDate} with due date not set`} href="/five-s/actions?status=OPEN" />
            <StatCard label="Overdue actions" value={data.totals.overdueActions} tone={data.totals.overdueActions ? "bad" : "default"} href="/five-s/actions?view=overdue" />
            <StatCard label="Awaiting verification" value={data.totals.awaitingVerification} href="/five-s/actions?view=to_verify" />
            <StatCard label="Pending red tags" value={data.totals.pendingRedTags} tone={data.totals.pendingRedTags ? "warn" : "default"} href="/five-s/red-tags?view=pending" />
            <StatCard
              label="Audits overdue"
              value={data.totals.auditsOverdue}
              hint={`${data.totals.auditsDueSoon} due within 7 days · ${data.totals.neverAudited} never audited`}
              tone={data.totals.auditsOverdue ? "bad" : "default"}
            />
          </div>

          <Card className="block py-0">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-foreground">Latest 5S level by area</h2>
              <p className="text-xs text-muted-foreground">Lower abnormality points are better. Level = 3.5 − ROUNDUP(total ÷ 4) × 0.1.</p>
            </div>
            {data.areas.length === 0 ? (
              <EmptyState title="No workplace areas match these filters" description="Areas come from the Work Area / Section on employee profiles." />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-full text-sm">
                  <TableHeader className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <TableRow>
                      <TableHead className="px-4 py-2">Area</TableHead>
                      <TableHead className="px-3 py-2">Latest level</TableHead>
                      <TableHead className="px-3 py-2">Target</TableHead>
                      {PRACTICE_ORDER.map((p) => (
                        <TableHead key={p} className="px-2 py-2 text-right" title={`${PRACTICE_LABELS[p]} abnormality points (0–20)`}>
                          {PRACTICE_LABELS[p]}
                        </TableHead>
                      ))}
                      <TableHead className="px-3 py-2 text-right">Total</TableHead>
                      <TableHead className="px-3 py-2">Last audit</TableHead>
                      <TableHead className="px-3 py-2">Open actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {data.areas.map((a) => (
                      <TableRow key={a.id} className="align-top">
                        <TableCell className="px-4 py-3">
                          <Link href={`/five-s/areas/${a.id}`} className="font-medium text-info hover:underline">
                            {a.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                            {a.department?.name ?? "No department"} · {a.owner?.name ?? "No owner"}
                            {a.isSample && <SampleBadge />}
                            {!a.isActive && <span className="rounded bg-muted px-1.5">Inactive</span>}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <LevelValue level={a.latest?.level} className="text-base" />
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <div className="tabular-nums">{formatLevel(a.targetLevel)}</div>
                          {a.latest && (
                            <div className="mt-1">
                              <TargetBadge met={a.targetMet} />
                            </div>
                          )}
                        </TableCell>
                        {PRACTICE_ORDER.map((p) => (
                          <TableCell key={p} className="px-2 py-3 text-right tabular-nums text-foreground">
                            {a.latest ? a.latest.points[p] : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="px-3 py-3 text-right font-semibold tabular-nums">{a.latest ? a.latest.totalPoints : "—"}</TableCell>
                        <TableCell className="px-3 py-3">
                          <div className="whitespace-nowrap">{a.latest ? formatDate(a.latest.auditDate) : "—"}</div>
                          {a.isActive && (
                            <div className="mt-1">
                              <AuditDueBadge state={a.auditDue.state} nextDueDate={a.auditDue.nextDueDate} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-foreground">
                          {a.counts.openActions + a.counts.awaitingVerification}
                          {a.counts.overdueActions > 0 && <span className="ml-1 font-semibold text-danger">({a.counts.overdueActions} overdue)</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="block py-0">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-foreground">Audit history</h2>
              <p className="text-xs text-muted-foreground">Submitted audits in the selected period, newest first.</p>
            </div>
            {data.auditHistory.length === 0 ? (
              <EmptyState title="No submitted audits in this period" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-full text-sm">
                  <TableHeader className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <TableRow>
                      <TableHead className="px-4 py-2">Date</TableHead>
                      <TableHead className="px-3 py-2">Audit</TableHead>
                      <TableHead className="px-3 py-2">Area</TableHead>
                      <TableHead className="px-3 py-2 text-right">Total points</TableHead>
                      <TableHead className="px-3 py-2">Level</TableHead>
                      <TableHead className="px-3 py-2">Target then</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {[...data.auditHistory].reverse().map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap px-4 py-2">{formatDate(h.auditDate)}</TableCell>
                        <TableCell className="px-3 py-2">
                          <Link href={`/five-s/audits/${h.id}`} className="font-medium text-info hover:underline">
                            {h.reference}
                          </Link>
                        </TableCell>
                        <TableCell className="px-3 py-2">{h.area.name}</TableCell>
                        <TableCell className="px-3 py-2 text-right tabular-nums">{h.totalPoints}</TableCell>
                        <TableCell className="px-3 py-2">
                          <LevelValue level={h.level} />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span className="mr-2 tabular-nums">{formatLevel(h.targetLevel)}</span>
                          <TargetBadge met={h.targetMet} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
