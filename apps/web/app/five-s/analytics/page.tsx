"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFiveSAnalytics } from "@/hooks/five-s/useFiveS";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { formatLevel } from "@/lib/five-s/scoring";
import {
  RED_TAG_REASON_LABELS,
  RED_TAG_STATUS_LABELS,
  type AnalyticsProfile,
  type AreaStatusFilter,
  type OverviewQuery,
  type RedTagStatus,
} from "@/services/five-s.service";
import { EmptyState, ErrorNote, FilterBar, LevelValue, Loading, PageHeader, StatCard, Surface, errorMessage, formatDate, selectClass } from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

// Same S colours as the overview chart so each S reads the same across screens.
const PRACTICE_COLORS = ["#2563eb", "#0d9488", "#f59e0b", "#8b5cf6", "#ef4444"];
// Departments take categorical slots in a fixed order by name, so a department keeps its colour
// whatever the filters or ranking.
const DEPARTMENT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const COMPANY_COLOR = "#64748b";
const RED_TAG_STATUS_COLORS: Record<RedTagStatus, string> = { PENDING: "#d03b3b", DECIDED: "#fab219", RESOLVED: "#0ca30c" };
const MAX_COMPARED = 4;

const axisTick = { fontSize: 11, fill: "#64748b" };

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function radarRows(series: { key: string; profile: AnalyticsProfile | null }[]) {
  return PRACTICE_ORDER.map((p) => ({
    practice: PRACTICE_LABELS[p],
    ...Object.fromEntries(series.map((s) => [s.key, s.profile?.conformance?.[p] ?? null])),
  }));
}

function ChartCard({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Surface className={cn("p-5", className)}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mb-4 text-xs text-slate-500">{description}</p>}
      {children}
    </Surface>
  );
}

export default function FiveSAnalyticsPage() {
  const [filters, setFilters] = useState<OverviewQuery>({ status: "active" });
  const { data, isLoading, error } = useFiveSAnalytics(filters);
  const [compared, setCompared] = useState<string[] | null>(null);
  const [areaId, setAreaId] = useState<string>("");

  const deptColor = useMemo(() => {
    const keys = [...(data?.departments ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((d) => d.key);
    return (key: string) => DEPARTMENT_COLORS[keys.indexOf(key) % DEPARTMENT_COLORS.length];
  }, [data?.departments]);

  const assessedDepts = useMemo(() => (data?.departments ?? []).filter((d) => d.assessed > 0), [data?.departments]);
  // Until the user picks, compare the first few assessed departments.
  const comparedKeys = (compared ?? assessedDepts.slice(0, MAX_COMPARED).map((d) => d.key)).filter((k) => assessedDepts.some((d) => d.key === k));
  const toggleCompared = (key: string) => {
    const next = comparedKeys.includes(key) ? comparedKeys.filter((k) => k !== key) : [...comparedKeys, key].slice(-MAX_COMPARED);
    setCompared(next);
  };

  const deptRadar = data
    ? radarRows([
        { key: "company", profile: data.overall },
        ...comparedKeys.map((k) => ({ key: k, profile: data.departments.find((d) => d.key === k) ?? null })),
      ])
    : [];

  const selectedArea = data?.areaProfiles.find((a) => a.id === areaId) ?? data?.areaProfiles[0];
  const areaRadar = useMemo(() => {
    if (!data || !selectedArea) return [];
    return radarRows([
      { key: "area", profile: selectedArea },
      { key: "department", profile: data.departments.find((d) => d.key === selectedArea.departmentKey) ?? null },
      { key: "company", profile: data.overall },
    ]);
  }, [data, selectedArea]);

  const levelByDept = assessedDepts.map((d) => ({ key: d.key, name: d.name, level: d.meanLevel, assessed: d.assessed, areas: d.areas }));
  const pointsByDept = assessedDepts.map((d) => ({
    name: d.name,
    ...Object.fromEntries(PRACTICE_ORDER.map((p) => [PRACTICE_LABELS[p], d.meanPoints?.[p] ?? 0])),
  }));
  const actionsByDept = (data?.departments ?? [])
    .filter((d) => d.openActions + d.awaitingVerification + d.pendingRedTags > 0)
    .map((d) => ({
      name: d.name,
      "Open (not overdue)": d.openActions - d.overdueActions,
      Overdue: d.overdueActions,
      "Awaiting verification": d.awaitingVerification,
    }));
  const trendDepts = (data?.departments ?? []).filter((d) => d.audits > 0).slice(0, DEPARTMENT_COLORS.length);
  const trend = (data?.trend ?? []).map((t) => ({ month: monthLabel(t.month), audits: t.audits, Company: t.meanLevel, ...t.byDepartment }));
  const hotspots = [...(data?.checkpoints ?? [])]
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map((c) => ({ ...c, label: `#${c.no} ${PRACTICE_LABELS[c.practice]}` }));
  const tagReasons = (data?.redTags.byReason ?? []).map((r) => ({ name: RED_TAG_REASON_LABELS[r.key], count: r.count }));
  const tagsByDept = (data?.redTags.byDepartment ?? []).filter((d) => d.PENDING + d.DECIDED + d.RESOLVED > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="5S Analytics"
        description="S-by-S profiles, department comparison, trends and problem hotspots. Only submitted audits count; areas without one in the period are not assessed, never zero."
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

      {isLoading && <Loading label="Loading analytics…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}

      {data && (
        <>
          <p className="text-xs text-slate-500">
            {formatDate(data.range.from)} – {formatDate(data.range.to)} · {data.method}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Mean 5S level" value={formatLevel(data.overall.meanLevel)} hint="Equal-weight mean of each area's latest level in the period" />
            <StatCard label="Areas assessed" value={`${data.overall.assessed} / ${data.overall.areas}`} hint={`${data.overall.areas - data.overall.assessed} not assessed in the period`} />
            <StatCard label="Audits submitted" value={data.overall.audits} hint={`${data.departments.length} department(s) in scope`} href="/five-s/audits" />
            <StatCard label="Red tags raised" value={data.redTags.total} tone={data.redTags.total ? "warn" : "default"} href="/five-s/red-tags" />
          </div>

          {data.overall.assessed === 0 ? (
            <Surface>
              <EmptyState title="No submitted audits in this period">Widen the dates or submit an audit to see analytics.</EmptyState>
            </Surface>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard
                  title="5S profile by department"
                  description="Conformance % per S = (20 − mean abnormality points) ÷ 20. Larger shapes are better; a dent shows the weakest S."
                >
                  <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={`Departments to compare (up to ${MAX_COMPARED})`}>
                    {assessedDepts.map((d) => {
                      const on = comparedKeys.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCompared(d.key)}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                            on ? "border-slate-400 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                          )}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? deptColor(d.key) : "#cbd5e1" }} aria-hidden="true" />
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={deptRadar} outerRadius="72%">
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="practice" tick={{ fontSize: 12, fill: "#334155" }} />
                        <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 10, fill: "#94a3b8" }} angle={90} />
                        <Radar name="Company" dataKey="company" stroke={COMPANY_COLOR} strokeDasharray="4 3" strokeWidth={2} fill={COMPANY_COLOR} fillOpacity={0.05} />
                        {comparedKeys.map((k) => (
                          <Radar
                            key={k}
                            name={data.departments.find((d) => d.key === k)?.name}
                            dataKey={k}
                            stroke={deptColor(k)}
                            strokeWidth={2}
                            fill={deptColor(k)}
                            fillOpacity={0.12}
                            dot={{ r: 3 }}
                          />
                        ))}
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Area 5S profile" description="An area's latest audit in the period against its department and the company.">
                  <label className="mb-3 block max-w-xs space-y-1 text-xs font-medium text-slate-600">
                    Area
                    <select className={selectClass} value={selectedArea?.id ?? ""} onChange={(e) => setAreaId(e.target.value)}>
                      {data.areaProfiles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.departmentName})
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedArea && (
                    <>
                      <p className="mb-1 text-xs text-slate-500">
                        Level <LevelValue level={selectedArea.level} /> (target {formatLevel(selectedArea.targetLevel)}) · {selectedArea.totalPoints} points ·{" "}
                        {formatDate(selectedArea.auditDate)} ·{" "}
                        <Link href={`/five-s/areas/${selectedArea.id}`} className="font-medium text-blue-700 hover:underline">
                          Open area
                        </Link>
                      </p>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={areaRadar} outerRadius="72%">
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="practice" tick={{ fontSize: 12, fill: "#334155" }} />
                            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 10, fill: "#94a3b8" }} angle={90} />
                            <Radar name="Company" dataKey="company" stroke={COMPANY_COLOR} strokeDasharray="4 3" strokeWidth={2} fill={COMPANY_COLOR} fillOpacity={0.05} />
                            <Radar
                              name={`${selectedArea.departmentName} (mean)`}
                              dataKey="department"
                              stroke={deptColor(selectedArea.departmentKey)}
                              strokeWidth={2}
                              fill={deptColor(selectedArea.departmentKey)}
                              fillOpacity={0.08}
                            />
                            <Radar name={selectedArea.name} dataKey="area" stroke="#0f172a" strokeWidth={2} fill="#0f172a" fillOpacity={0.12} dot={{ r: 3 }} />
                            <Tooltip formatter={(v) => `${v}%`} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </ChartCard>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Mean 5S level by department" description="Equal-weight mean of each assessed area's latest level (1.0–3.5, higher is better).">
                  <div style={{ height: Math.max(160, levelByDept.length * 44 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={levelByDept} layout="vertical" margin={{ left: 8, right: 32 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 3.5]} ticks={[0, 1, 1.5, 2, 2.5, 3, 3.5]} tick={axisTick} />
                        <YAxis type="category" dataKey="name" width={120} tick={axisTick} />
                        <Tooltip formatter={(v) => formatLevel(Number(v))} labelFormatter={(l) => String(l)} />
                        <Bar dataKey="level" name="Mean level" radius={[0, 4, 4, 0]} barSize={22} label={{ position: "right", fontSize: 11, fill: "#334155", formatter: (v: unknown) => formatLevel(Number(v)) }}>
                          {levelByDept.map((d) => (
                            <Cell key={d.key} fill={deptColor(d.key)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Abnormality points by S per department" description="Mean points of each area's latest audit (each S 0–20). Shorter bars mean fewer problem locations.">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointsByDept} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={axisTick} interval={0} />
                        <YAxis allowDecimals={false} tick={axisTick} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {PRACTICE_ORDER.map((p, i) => (
                          <Bar key={p} dataKey={PRACTICE_LABELS[p]} fill={PRACTICE_COLORS[i]} radius={[3, 3, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              {trend.length > 0 && (
                <ChartCard title="5S level trend" description="Mean level of all audits submitted each month, for the company and each department.">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ left: -20, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={axisTick} />
                        <YAxis domain={[1, 3.5]} ticks={[1, 1.5, 2, 2.5, 3, 3.5]} tick={axisTick} />
                        <Tooltip formatter={(v) => formatLevel(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="Company" stroke={COMPANY_COLOR} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 4 }} connectNulls />
                        {trendDepts.map((d) => (
                          <Line key={d.key} type="monotone" dataKey={d.key} name={d.name} stroke={deptColor(d.key)} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              )}

              <ChartCard
                title="Problem hotspots by checkpoint"
                description="Total problem locations recorded against each checkpoint in the period (top 10). Hover for the checkpoint wording."
              >
                {hotspots.length === 0 ? (
                  <p className="text-sm text-slate-500">No problem locations recorded in this period.</p>
                ) : (
                  <div style={{ height: hotspots.length * 36 + 40 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hotspots} layout="vertical" margin={{ left: 8, right: 32 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={axisTick} />
                        <YAxis type="category" dataKey="label" width={150} tick={axisTick} />
                        <Tooltip
                          content={({ active, payload }) => {
                            const c = active && payload?.[0]?.payload;
                            if (!c) return null;
                            return (
                              <div className="max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-md">
                                <p className="font-semibold text-slate-900">
                                  Checkpoint {c.no} · {PRACTICE_LABELS[c.practice as keyof typeof PRACTICE_LABELS]}
                                </p>
                                <p className="mt-1 text-slate-600">{c.text}</p>
                                <p className="mt-2 text-slate-800">
                                  {c.points} problem location(s) · found in {c.auditsWithFindings} audit(s)
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="points" name="Problem locations" radius={[0, 4, 4, 0]} barSize={20} label={{ position: "right", fontSize: 11, fill: "#334155" }}>
                          {hotspots.map((c) => (
                            <Cell key={c.no} fill={PRACTICE_COLORS[PRACTICE_ORDER.indexOf(c.practice)]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>
            </>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Red tags by reason" description="Tags raised in the period.">
              {data.redTags.total === 0 ? (
                <p className="text-sm text-slate-500">No red tags raised in this period.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tagReasons} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={axisTick} interval={0} />
                      <YAxis allowDecimals={false} tick={axisTick} />
                      <Tooltip />
                      <Bar dataKey="count" name="Red tags" fill="#d03b3b" radius={[4, 4, 0, 0]} barSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Red tags by department and status" description="Tags raised in the period, by where they stand now.">
              {tagsByDept.length === 0 ? (
                <p className="text-sm text-slate-500">No red tags raised in this period.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tagsByDept} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={axisTick} interval={0} />
                      <YAxis allowDecimals={false} tick={axisTick} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {(["PENDING", "DECIDED", "RESOLVED"] as RedTagStatus[]).map((s) => (
                        <Bar key={s} dataKey={s} name={RED_TAG_STATUS_LABELS[s]} stackId="tags" fill={RED_TAG_STATUS_COLORS[s]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          {actionsByDept.length > 0 && (
            <ChartCard title="Improvement actions by department" description="Actions not yet verified, as of today.">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={actionsByDept} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={axisTick} interval={0} />
                    <YAxis allowDecimals={false} tick={axisTick} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Open (not overdue)" stackId="a" fill="#2a78d6" />
                    <Bar dataKey="Overdue" stackId="a" fill="#d03b3b" />
                    <Bar dataKey="Awaiting verification" stackId="a" fill="#fab219" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          <Surface>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Department summary</h2>
              <p className="text-xs text-slate-500">S columns are mean abnormality points (0–20, lower is better) of each area&apos;s latest audit in the period.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Department</th>
                    <th className="px-3 py-2">Assessed</th>
                    <th className="px-3 py-2">Mean level</th>
                    <th className="px-3 py-2">Target met</th>
                    {PRACTICE_ORDER.map((p) => (
                      <th key={p} className="px-2 py-2 text-right">
                        {PRACTICE_LABELS[p]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Audits</th>
                    <th className="px-3 py-2 text-right">Open actions</th>
                    <th className="px-3 py-2 text-right">Pending red tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.departments.map((d) => (
                    <tr key={d.key}>
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: deptColor(d.key) }} aria-hidden="true" />
                        {d.id ? (
                          <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setFilters({ ...filters, departmentId: d.id! })}>
                            {d.name}
                          </button>
                        ) : (
                          <span className="font-medium text-slate-700">{d.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {d.assessed} / {d.areas}
                      </td>
                      <td className="px-3 py-2">
                        <LevelValue level={d.meanLevel} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">{d.assessed ? `${d.targetMet} / ${d.assessed}` : "—"}</td>
                      {PRACTICE_ORDER.map((p) => (
                        <td key={p} className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {d.meanPoints ? d.meanPoints[p] : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums">{d.audits}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.openActions + d.awaitingVerification}
                        {d.overdueActions > 0 && <span className="ml-1 font-semibold text-red-700">({d.overdueActions} overdue)</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.pendingRedTags}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
