"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { useFiveSCapabilities, useFiveSOverview } from "@/hooks/five-s/useFiveS";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { formatLevel } from "@/lib/five-s/scoring";
import type { AreaStatusFilter, OverviewQuery } from "@/services/five-s.service";
import {
  AuditDueBadge,
  EmptyState,
  ErrorNote,
  FilterBar,
  LevelValue,
  Loading,
  PageHeader,
  SampleBadge,
  StatCard,
  Surface,
  TargetBadge,
  errorMessage,
  formatDate,
  primaryButton,
  secondaryButton,
  selectClass,
} from "@/components/five-s/ui";

const PRACTICE_COLORS = ["#2563eb", "#0d9488", "#f59e0b", "#8b5cf6", "#ef4444"];

export default function FiveSOverviewPage() {
  const [filters, setFilters] = useState<OverviewQuery>({ status: "active" });
  const { data, isLoading, error } = useFiveSOverview(filters);
  const { data: caps } = useFiveSCapabilities();

  const chartData = useMemo(
    () =>
      (data?.areas ?? [])
        .filter((a) => a.latest)
        .map((a) => ({ name: a.name, ...Object.fromEntries(PRACTICE_ORDER.map((p) => [PRACTICE_LABELS[p], a.latest!.points[p]])) })),
    [data?.areas],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="5S Overview"
        description="Key 1 of the 20 Keys: Cleaning and Organising to Make Work Easy. Only submitted audits count; drafts are excluded."
        actions={
          <>
            {caps?.canCreateAreas && (
              <Link href="/five-s/areas/new" className={secondaryButton}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New area
              </Link>
            )}
            <Link href="/five-s/audits/new" className={primaryButton}>
              Start an audit
            </Link>
          </>
        }
      />

      <FilterBar value={filters} onChange={setFilters}>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Area status
          <select
            className={selectClass}
            value={filters.status ?? "active"}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as AreaStatusFilter })}
          >
            <option value="active">Active areas</option>
            <option value="inactive">Inactive areas</option>
            <option value="all">All areas</option>
          </select>
        </label>
      </FilterBar>

      {isLoading && <Loading label="Loading overview…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}

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

          <Surface>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Latest 5S level by area</h2>
              <p className="text-xs text-slate-500">Lower abnormality points are better. Level = 3.5 − ROUNDUP(total ÷ 4) × 0.1.</p>
            </div>
            {data.areas.length === 0 ? (
              <EmptyState title="No workplace areas match these filters">
                {caps?.canCreateAreas ? (
                  <Link href="/five-s/areas/new" className="font-medium text-blue-700 hover:underline">
                    Create the first area
                  </Link>
                ) : (
                  "Ask a 5S administrator or your HOD to set up areas."
                )}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Area</th>
                      <th className="px-3 py-2">Latest level</th>
                      <th className="px-3 py-2">Target</th>
                      {PRACTICE_ORDER.map((p) => (
                        <th key={p} className="px-2 py-2 text-right" title={`${PRACTICE_LABELS[p]} abnormality points (0–20)`}>
                          {PRACTICE_LABELS[p]}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Last audit</th>
                      <th className="px-3 py-2">Open actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.areas.map((a) => (
                      <tr key={a.id} className="align-top">
                        <td className="px-4 py-3">
                          <Link href={`/five-s/areas/${a.id}`} className="font-medium text-blue-700 hover:underline">
                            {a.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-500">
                            {a.department?.name ?? "No department"} · {a.owner?.name ?? "No owner"}
                            {a.isSample && <SampleBadge />}
                            {!a.isActive && <span className="rounded bg-slate-100 px-1.5">Inactive</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <LevelValue level={a.latest?.level} className="text-base" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="tabular-nums">{formatLevel(a.targetLevel)}</div>
                          {a.latest && (
                            <div className="mt-1">
                              <TargetBadge met={a.targetMet} />
                            </div>
                          )}
                        </td>
                        {PRACTICE_ORDER.map((p) => (
                          <td key={p} className="px-2 py-3 text-right tabular-nums text-slate-700">
                            {a.latest ? a.latest.points[p] : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{a.latest ? a.latest.totalPoints : "—"}</td>
                        <td className="px-3 py-3">
                          <div className="whitespace-nowrap">{a.latest ? formatDate(a.latest.auditDate) : "—"}</div>
                          {a.isActive && (
                            <div className="mt-1">
                              <AuditDueBadge state={a.auditDue.state} nextDueDate={a.auditDue.nextDueDate} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {a.counts.openActions + a.counts.awaitingVerification}
                          {a.counts.overdueActions > 0 && <span className="ml-1 font-semibold text-red-700">({a.counts.overdueActions} overdue)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>

          {chartData.length > 0 && (
            <Surface className="p-5">
              <h2 className="text-base font-semibold text-slate-900">Abnormality points by S (latest audit per area)</h2>
              <p className="mb-4 text-xs text-slate-500">Each S can score 0–20 points. Shorter bars mean fewer problem locations.</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {PRACTICE_ORDER.map((p, i) => (
                      <Bar key={p} dataKey={PRACTICE_LABELS[p]} stackId="s" fill={PRACTICE_COLORS[i]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Surface>
          )}

          <Surface>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Audit history</h2>
              <p className="text-xs text-slate-500">Submitted audits in the selected period, newest first.</p>
            </div>
            {data.auditHistory.length === 0 ? (
              <EmptyState title="No submitted audits in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-3 py-2">Audit</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2 text-right">Total points</th>
                      <th className="px-3 py-2">Level</th>
                      <th className="px-3 py-2">Target then</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...data.auditHistory].reverse().map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap px-4 py-2">{formatDate(h.auditDate)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/five-s/audits/${h.id}`} className="font-medium text-blue-700 hover:underline">
                            {h.reference}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{h.area.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{h.totalPoints}</td>
                        <td className="px-3 py-2">
                          <LevelValue level={h.level} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="mr-2 tabular-nums">{formatLevel(h.targetLevel)}</span>
                          <TargetBadge met={h.targetMet} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
