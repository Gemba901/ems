"use client";

import { type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EMPLOYMENT_STATUS_LABELS, SKILL_LEVEL_LABELS,
  completionBg,
} from "@/services/ems.service";
import {
  Users, AlertCircle, UserCheck, ChevronRight, Loader2,
  BarChart3, Activity, TrendingUp, ClipboardList,
  User, Briefcase, FileText, Phone, type LucideIcon,
} from "lucide-react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function ringColor(pct: number) {
  if (pct >= 97) return "#10b981";
  if (pct >= 90) return "#3b82f6";
  if (pct >= 75) return "#f59e0b";
  return "#ef4444";
}

function statusLabel(pct: number) {
  if (pct >= 97) return "Excellent";
  if (pct >= 90) return "Good";
  if (pct >= 75) return "Fair";
  return "Poor";
}

// ── Components ────────────────────────────────────────────────────────────────

function RingGauge({ pct, size = 100, strokeWidth = 9 }: { pct: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor(pct)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold text-slate-800 leading-none" style={{ fontSize: Math.max(size * 0.18, 10) }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Excellent: "bg-emerald-100 text-emerald-700",
    Good:      "bg-blue-100 text-blue-700",
    Fair:      "bg-amber-100 text-amber-700",
    Poor:      "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.Poor}`}>
      {status}
    </span>
  );
}

function CardHeader({ icon: Icon, title, iconColor = "text-indigo-500", iconBg = "bg-indigo-50" }: {
  icon: ElementType;
  title: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
    </div>
  );
}

function ProportionStrip({ segments }: { segments: { pct: number; color: string; label: string }[] }) {
  return (
    <div className="flex h-1.5 overflow-hidden">
      {segments.map(({ pct, color, label }) =>
        pct > 0 ? (
          <div key={label} className={`${color}`} style={{ width: `${pct}%` }} title={label} />
        ) : null,
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmsDashboardPage() {
  const { accessToken } = useAuthStore();

  const { data: dashboard, isLoading: loading, error } = useQuery({
    queryKey: ["ems-dashboard"],
    queryFn: () => EmsService.getDashboard(accessToken!),
    enabled: !!accessToken,
});



  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-6">

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error.message}</div>
        )}

        {dashboard && (() => {
          const overall = dashboard.summary.overallAvg;

          return (
            <>
              {/* ── Hero ──────────────────────────────────────────────────── */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-50">
                      <ClipboardList className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Employee Master Data</p>
                      <p className="text-[11px] text-slate-400">Employee record completeness across your organization</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-4">
                  {/* Overall score row */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Overall Completion</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-slate-900 leading-none tabular-nums">
                          {overall}<span className="text-xl font-semibold text-slate-300">%</span>
                        </span>
                        <StatusBadge status={statusLabel(overall)} />
                      </div>
                    </div>
                    <RingGauge pct={overall} size={64} strokeWidth={6} />
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${overall}%`, backgroundColor: ringColor(overall) }}
                    />
                  </div>

                  {/* Stats 2×2 */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {[
                      { label: "Total Employees",    value: dashboard.summary.total },
                      { label: "Active / Probation", value: dashboard.summary.activeOrProbation },
                      { label: "Needs HR Update",    value: dashboard.summary.recordsNeedingUpdate },
                      { label: "Avg Service",        value: dashboard.summary.avgService ?? "—", sub: "yrs" },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
                        <p className="text-2xl font-bold text-slate-900 leading-none">
                          {value}
                          {sub && <span className="text-xs font-normal text-slate-400 ml-1">{sub}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Group Completeness ────────────────────────────────────── */}
              {(() => {
                const GROUP_ICONS: Record<string, LucideIcon> = {
                  IDENTITY: User, WORK_ALLOCATION: Briefcase, ROLE_RESPONSIBILITY: FileText, CONTACT: Phone, SKILL: TrendingUp,
                };
                return (
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                    <CardHeader icon={BarChart3} title="Data Completeness by Group" />
                    <div className="p-5 space-y-3.5">
                      {dashboard.groupSummary.map((g) => {
                        const Icon = GROUP_ICONS[g.key] ?? ClipboardList;
                        const color = ringColor(g.avgCompletion);
                        return (
                          <div key={g.key} className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                              <Icon className="h-4 w-4 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-slate-700 truncate">{g.label}</span>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <StatusBadge status={g.status} />
                                  <span className="text-xs font-bold tabular-nums" style={{ color }}>{g.avgCompletion}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${g.avgCompletion}%`, backgroundColor: color }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Overall */}
                    <div className="mx-5 mb-5 flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-slate-600">Overall Average</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 tabular-nums">{overall}%</span>
                            <StatusBadge status={statusLabel(overall)} />
                          </div>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overall}%`, backgroundColor: ringColor(overall) }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Employment Status + Department ────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                {/* Employment Status */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={UserCheck} title="Employment Status" iconColor="text-blue-500" iconBg="bg-blue-50" />
                  <ProportionStrip
                    segments={Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key]) => {
                      const count = dashboard.statusCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? (count / dashboard.summary.total) * 100 : 0;
                      const colorMap: Record<string, string> = {
                        ACTIVE: "bg-emerald-500", PROBATION: "bg-blue-400",
                        RESIGNED: "bg-slate-400", TERMINATED: "bg-red-400",
                        RETIRED: "bg-purple-400", SUSPENDED: "bg-amber-400",
                        ABSCONDED: "bg-orange-500", CONTRACT_ENDED: "bg-slate-300",
                      };
                      return {
                        pct,
                        color: colorMap[key] ?? "bg-slate-300",
                        label: EMPLOYMENT_STATUS_LABELS[key as keyof typeof EMPLOYMENT_STATUS_LABELS],
                      };
                    })}
                  />
                  <div className="divide-y divide-slate-50">
                    {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key, label]) => {
                      const count = dashboard.statusCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? Math.round((count / dashboard.summary.total) * 100) : 0;
                      return (
                        <div key={key} className="px-5 py-2.5 flex items-center justify-between">
                          <p className="text-sm text-slate-600">{label}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-slate-800">{count}</span>
                            <span className="text-xs text-slate-400 w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Department Breakdown */}
                <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Users} title="Department Breakdown" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                          <th className="text-left px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">Department</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Active</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Total</th>
                          <th className="text-right px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dashboard.deptBreakdown.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-slate-700 font-medium">{d.name}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{d.activeCount}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{d.totalCount}</td>
                            <td className="px-5 py-3 text-right font-semibold text-slate-700">{d.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ── Gender + Skill ────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">

                {/* Gender Distribution */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Activity} title="Gender Distribution" iconColor="text-pink-500" iconBg="bg-pink-50" />
                  <ProportionStrip
                    segments={[
                      { key: "MALE",   color: "bg-blue-400",   label: "Male" },
                      { key: "FEMALE", color: "bg-pink-400",   label: "Female" },
                      { key: "OTHER",  color: "bg-purple-400", label: "Other" },
                    ].map(({ key, color, label }) => ({
                      pct: dashboard.summary.total > 0
                        ? ((dashboard.genderCounts[key] ?? 0) / dashboard.summary.total) * 100
                        : 0,
                      color,
                      label,
                    }))}
                  />
                  <div className="divide-y divide-slate-50">
                    {[
                      { label: "Male",   key: "MALE",   dot: "bg-blue-400" },
                      { label: "Female", key: "FEMALE", dot: "bg-pink-400" },
                      { label: "Other",  key: "OTHER",  dot: "bg-purple-400" },
                    ].map(({ label, key, dot }) => {
                      const count = dashboard.genderCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? Math.round((count / dashboard.summary.total) * 100) : 0;
                      return (
                        <div key={key} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${dot}`} />
                            <p className="text-sm text-slate-600">{label}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">{count}</span>
                            <span className="text-xs text-slate-400 w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Skill Level */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={TrendingUp} title="Skill Level" iconColor="text-emerald-500" iconBg="bg-emerald-50" />
                  <div className="divide-y divide-slate-50">
                    {(Object.entries(SKILL_LEVEL_LABELS) as [string, string][]).map(([key, label]) => {
                      const count = dashboard.skillCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? (count / dashboard.summary.total) * 100 : 0;
                      return (
                        <div key={key} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs text-slate-600 leading-tight">{label}</p>
                            <span className="text-sm font-semibold text-slate-800 ml-3 shrink-0">{count}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(dashboard.skillCounts.NONE ?? 0) > 0 && (
                      <div className="px-5 py-3 flex items-center justify-between">
                        <p className="text-xs text-slate-400">No information</p>
                        <span className="text-sm font-semibold text-slate-400">{dashboard.skillCounts.NONE}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Steering Committee ────────────────────────────────────── */}
              {dashboard.committeeSummary.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Users} title="Committee Participation" iconColor="text-purple-500" iconBg="bg-purple-50" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                          <th className="text-left px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">Committee</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Members</th>
                          <th className="text-right px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">% of Staff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dashboard.committeeSummary.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-slate-700 font-medium">{c.name}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{c.memberCount}</td>
                            <td className="px-5 py-3 text-right font-semibold text-slate-700">{c.pctOfEmployees}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Priority Records ──────────────────────────────────────── */}
              {dashboard.priorityEmployees.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-red-100 bg-red-50 flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-red-100">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <p className="text-sm font-bold text-red-800">Priority Records Needing HR Update</p>
                    <span className="ml-auto text-[10px] font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
                      Completion &lt; 90%
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {dashboard.priorityEmployees.map((emp) => (
                      <div key={emp.id} className="px-5 py-3.5 flex items-center gap-4">
                        {/* Initials avatar */}
                        <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-slate-500">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </span>
                        </div>
                        {/* Name + dept */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/ems/employees/${emp.id}`}
                            className="text-sm font-semibold text-slate-800 hover:text-indigo-600 transition-colors"
                          >
                            {emp.firstName} {emp.lastName}
                          </Link>
                          <p className="text-xs text-slate-400 truncate">
                            {emp.department?.name ?? "—"}
                            {emp.employeeCode ? ` · ${emp.employeeCode}` : ""}
                          </p>
                        </div>
                        {/* Ring */}
                        <RingGauge pct={emp.overall} size={48} strokeWidth={5} />
                        {/* Action label */}
                        <div className="hidden sm:block text-right shrink-0">
                          <p className="text-[11px] text-slate-400">Update needed</p>
                          <p className="text-xs font-semibold text-slate-700">{emp.lowestGroupLabel}</p>
                        </div>
                        {/* CTA */}
                        <Link
                          href={`/ems/employees/${emp.id}`}
                          className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        >
                          Update
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </ProtectedRoute>
  );
}
