"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EMPLOYMENT_STATUS_LABELS, SKILL_LEVEL_LABELS,
} from "@/services/ems.service";
import {
  Users, AlertCircle, UserCheck, Loader2,
  BarChart3, Activity, TrendingUp, ClipboardList,
  User, Briefcase, FileText, Phone, type LucideIcon,
} from "lucide-react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function ringColor(pct: number) {
  if (pct >= 97) return "var(--success)";
  if (pct >= 90) return "var(--info)";
  if (pct >= 75) return "var(--warning)";
  return "var(--danger)";
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth} />
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
        <span className="font-bold text-foreground leading-none" style={{ fontSize: Math.max(size * 0.18, 10) }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

function CompletionBadge({ status }: { status: string }) {
  const variant = status === "Excellent" ? "success" : status === "Good" ? "info" : status === "Fair" ? "warning" : status === "Poor" ? "danger" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

function CardHeader({ icon: Icon, title, iconColor = "text-primary", iconBg = "bg-primary/10" }: {
  icon: ElementType;
  title: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="px-5 py-4 border-b border-border bg-muted flex items-center gap-2.5">
      <div className={`p-1.5 rounded-lg ${iconBg}`}>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
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

const EMS_AREAS = [
  { href: "/ems/employees", label: "Employees", description: "Profile completeness for all staff" },
  { href: "/ems/onboarding", label: "BEES Onboarding imports", description: "Bulk-load employee data for registration" },
  { href: "/ems/organisation", label: "Organisation", description: "Departments, branches and their HODs" },
];

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
        <PageHeader
          title="Employee Management"
          description="Track employee records and profile completeness."
          actions={
            <Link href="/ems/employees" className={buttonVariants({ variant: "outline" })}>
              View employees
            </Link>
          }
        />

        <nav aria-label="Employee management areas">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {EMS_AREAS.map((area) => (
              <li key={area.href}>
                <Card className="relative h-full gap-1 p-card transition hover:ring-ring">
                  <Link
                    href={area.href}
                    className="font-semibold rounded-sm focus-visible:outline-ring after:absolute after:inset-0 after:rounded-xl"
                  >
                    {area.label}
                  </Link>
                  <p className="text-body text-muted-foreground">{area.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </nav>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
          </div>
        )}
        {error && (
          <div role="alert" className="bg-danger-subtle text-danger text-sm px-4 py-3 rounded-xl border border-danger/20">{error.message}</div>
        )}

        {dashboard && (() => {
          const overall = dashboard.summary.overallAvg;

          return (
            <>
              {/* ── Hero ──────────────────────────────────────────────────── */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-muted flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <ClipboardList className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Employee Master Data</p>
                      <p className="text-[11px] text-muted-foreground">Employee record completeness across your organization</p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-4">
                  {/* Overall score row */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Overall Completion</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-foreground leading-none tabular-nums">
                          {overall}<span className="text-xl font-semibold text-muted-foreground">%</span>
                        </span>
                        <CompletionBadge status={statusLabel(overall)} />
                      </div>
                    </div>
                    <RingGauge pct={overall} size={64} strokeWidth={6} />
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
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
                      <div key={label} className="bg-muted border border-border rounded-xl px-4 py-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</p>
                        <p className="text-2xl font-bold text-foreground leading-none">
                          {value}
                          {sub && <span className="text-xs font-normal text-muted-foreground ml-1">{sub}</span>}
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
                  <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                    <CardHeader icon={BarChart3} title="Data Completeness by Group" />
                    <div className="p-5 space-y-3.5">
                      {dashboard.groupSummary.map((g) => {
                        const Icon = GROUP_ICONS[g.key] ?? ClipboardList;
                        const color = ringColor(g.avgCompletion);
                        return (
                          <div key={g.key} className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-medium text-foreground truncate">{g.label}</span>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  <CompletionBadge status={g.status} />
                                  <span className="text-xs font-bold tabular-nums" style={{ color }}>{g.avgCompletion}%</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${g.avgCompletion}%`, backgroundColor: color }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Overall */}
                    <div className="mx-5 mb-5 flex items-center gap-3 px-4 py-3 bg-muted border border-border rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-muted-foreground">Overall Average</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground tabular-nums">{overall}%</span>
                            <CompletionBadge status={statusLabel(overall)} />
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
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
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={UserCheck} title="Employment Status" iconColor="text-info" iconBg="bg-info-subtle" />
                  <ProportionStrip
                    segments={Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key]) => {
                      const count = dashboard.statusCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? (count / dashboard.summary.total) * 100 : 0;
                      const colorMap: Record<string, string> = {
                        ACTIVE: "bg-success", PROBATION: "bg-info",
                        RESIGNED: "bg-muted-foreground", TERMINATED: "bg-danger",
                        RETIRED: "bg-primary", SUSPENDED: "bg-warning",
                        ABSCONDED: "bg-warning", CONTRACT_ENDED: "bg-muted-foreground",
                      };
                      return {
                        pct,
                        color: colorMap[key] ?? "bg-muted-foreground",
                        label: EMPLOYMENT_STATUS_LABELS[key as keyof typeof EMPLOYMENT_STATUS_LABELS],
                      };
                    })}
                  />
                  <div className="divide-y divide-border">
                    {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([key, label]) => {
                      const count = dashboard.statusCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? Math.round((count / dashboard.summary.total) * 100) : 0;
                      return (
                        <div key={key} className="px-5 py-2.5 flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">{label}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-foreground">{count}</span>
                            <span className="text-xs text-muted-foreground w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Department Breakdown */}
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Users} title="Department Breakdown" />
                  <div className="overflow-x-auto">
                    <Table aria-label="Department breakdown">
                      <TableHeader>
                        <TableRow className="bg-muted border-b border-border text-muted-foreground">
                          <TableHead className="text-left px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">Department</TableHead>
                          <TableHead className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Active</TableHead>
                          <TableHead className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Total</TableHead>
                          <TableHead className="text-right px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border">
                        {dashboard.deptBreakdown.map((d) => (
                          <TableRow key={d.id} className="hover:bg-muted transition-colors">
                            <TableCell className="px-5 py-3 text-foreground font-medium">{d.name}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-muted-foreground">{d.activeCount}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-muted-foreground">{d.totalCount}</TableCell>
                            <TableCell className="px-5 py-3 text-right font-semibold text-foreground">{d.pct}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* ── Gender + Skill ────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">

                {/* Gender Distribution */}
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Activity} title="Gender Distribution" iconColor="text-danger" iconBg="bg-danger-subtle" />
                  <ProportionStrip
                    segments={[
                      { key: "MALE",   color: "bg-info",   label: "Male" },
                      { key: "FEMALE", color: "bg-danger",   label: "Female" },
                      { key: "OTHER",  color: "bg-primary", label: "Other" },
                    ].map(({ key, color, label }) => ({
                      pct: dashboard.summary.total > 0
                        ? ((dashboard.genderCounts[key] ?? 0) / dashboard.summary.total) * 100
                        : 0,
                      color,
                      label,
                    }))}
                  />
                  <div className="divide-y divide-border">
                    {[
                      { label: "Male",   key: "MALE",   dot: "bg-info" },
                      { label: "Female", key: "FEMALE", dot: "bg-danger" },
                      { label: "Other",  key: "OTHER",  dot: "bg-primary" },
                    ].map(({ label, key, dot }) => {
                      const count = dashboard.genderCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? Math.round((count / dashboard.summary.total) * 100) : 0;
                      return (
                        <div key={key} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${dot}`} />
                            <p className="text-sm text-muted-foreground">{label}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{count}</span>
                            <span className="text-xs text-muted-foreground w-7 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Skill Level */}
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={TrendingUp} title="Skill Level" iconColor="text-success" iconBg="bg-success-subtle" />
                  <div className="divide-y divide-border">
                    {(Object.entries(SKILL_LEVEL_LABELS) as [string, string][]).map(([key, label]) => {
                      const count = dashboard.skillCounts[key] ?? 0;
                      const pct = dashboard.summary.total > 0 ? (count / dashboard.summary.total) * 100 : 0;
                      return (
                        <div key={key} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                            <span className="text-sm font-semibold text-foreground ml-3 shrink-0">{count}</span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {(dashboard.skillCounts.NONE ?? 0) > 0 && (
                      <div className="px-5 py-3 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">No information</p>
                        <span className="text-sm font-semibold text-muted-foreground">{dashboard.skillCounts.NONE}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Steering Committee ────────────────────────────────────── */}
              {dashboard.committeeSummary.length > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <CardHeader icon={Users} title="Committee Participation" iconColor="text-primary" iconBg="bg-primary/10" />
                  <div className="overflow-x-auto">
                    <Table aria-label="Committee participation">
                      <TableHeader>
                        <TableRow className="bg-muted border-b border-border text-muted-foreground">
                          <TableHead className="text-left px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">Committee</TableHead>
                          <TableHead className="text-right px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Members</TableHead>
                          <TableHead className="text-right px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">% of Staff</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border">
                        {dashboard.committeeSummary.map((c) => (
                          <TableRow key={c.id} className="hover:bg-muted transition-colors">
                            <TableCell className="px-5 py-3 text-foreground font-medium">{c.name}</TableCell>
                            <TableCell className="px-4 py-3 text-right text-muted-foreground">{c.memberCount}</TableCell>
                            <TableCell className="px-5 py-3 text-right font-semibold text-foreground">{c.pctOfEmployees}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── Priority Records ──────────────────────────────────────── */}
              {dashboard.priorityEmployees.length > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-danger/20 bg-danger-subtle flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-danger-subtle">
                      <AlertCircle className="h-3.5 w-3.5 text-danger" />
                    </div>
                    <p className="text-sm font-bold text-danger">Priority Records Needing HR Update</p>
                    <span className="ml-auto text-[10px] font-bold text-danger bg-danger-subtle px-2.5 py-1 rounded-full">
                      Completion &lt; 90%
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {dashboard.priorityEmployees.map((emp) => (
                      <div key={emp.id} className="px-5 py-3.5 flex items-center gap-4">
                        {/* Initials avatar */}
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </span>
                        </div>
                        {/* Name + dept */}
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/ems/employees/${emp.id}`}
                            className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                          >
                            {emp.firstName} {emp.lastName}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate">
                            {emp.department?.name ?? "—"}
                            {emp.employeeCode ? ` · ${emp.employeeCode}` : ""}
                          </p>
                        </div>
                        {/* Ring */}
                        <RingGauge pct={emp.overall} size={48} strokeWidth={5} />
                        {/* Action label */}
                        <div className="hidden sm:block text-right shrink-0">
                          <p className="text-[11px] text-muted-foreground">Update needed</p>
                          <p className="text-xs font-semibold text-foreground">{emp.lowestGroupLabel}</p>
                        </div>
                        {/* CTA */}
                        <Link
                          href={`/ems/employees/${emp.id}`}
                          className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                          aria-label={`Update ${emp.firstName} ${emp.lastName}`}
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
