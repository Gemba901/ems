"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Building2,
  BarChart3,
  Lightbulb,
  ListChecks,
  FileEdit,
  UserCircle,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
  TrendingUp,
  Settings,
  Stethoscope,
  UserCheck,
  UserX,
  Layers,
  MessageSquare,
  CheckCheck,
  Clock,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { EmployeeService, OrgStatsResponse } from "@/services/employee.service";
import { SimsService, SuggestionSummary } from "@/services/sims.service";

function useOrgFullStats() {
  const { user, accessToken } = useAuthStore();
  const [stats, setStats] = useState<OrgStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !user?.organizationId) return;
    EmployeeService.getOrgStats(user.organizationId, accessToken)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [accessToken, user?.organizationId]);

  return { stats, loading };
}

function useSimsSummary() {
  const { accessToken } = useAuthStore();
  const [summary, setSummary] = useState<SuggestionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    SimsService.getSummary(accessToken)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [accessToken]);

  return { summary, loading };
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function MiniRing({
  pct,
  stroke,
  track,
}: {
  pct: number;
  stroke: string;
  track: string;
}) {
  const r = 12;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(pct, 100)) / 100) * circ;
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      className="-rotate-90 shrink-0"
    >
      <circle
        cx="15"
        cy="15"
        r={r}
        fill="none"
        strokeWidth="4"
        className={track}
      />
      <circle
        cx="15"
        cy="15"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        className={`transition-all duration-700 ${stroke}`}
      />
    </svg>
  );
}

interface DashStatProps {
  label: string;
  value: number | string | null;
  sub?: string;
  icon: React.ElementType;
  gradient: string;
  border: string;
  iconBg: string;
  iconColor: string;
  numColor: string;
  labelColor: string;
  subColor: string;
  loading: boolean;
  ring?: { pct: number; stroke: string; track: string };
}

function DashStat({
  label,
  value,
  sub,
  icon: Icon,
  gradient,
  border,
  iconBg,
  iconColor,
  numColor,
  labelColor,
  subColor,
  loading,
  ring,
}: DashStatProps) {
  return (
    <div
      className={`rounded-xl border ${border} bg-gradient-to-br ${gradient} p-4 flex flex-col gap-3`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        {ring && !loading && (
          <MiniRing pct={ring.pct} stroke={ring.stroke} track={ring.track} />
        )}
        {ring && loading && (
          <div className="h-7 w-7 rounded-full bg-white/50 animate-pulse" />
        )}
      </div>
      <div>
        {loading || value === null ? (
          <div className="h-7 w-14 rounded-lg bg-white/60 animate-pulse mb-1.5" />
        ) : (
          <p
            className={`text-2xl font-bold tabular-nums leading-none ${numColor}`}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        )}
        <p className={`text-xs font-semibold mt-1.5 ${labelColor}`}>{label}</p>
        {sub && !loading && value !== null && (
          <p className={`text-[11px] mt-0.5 leading-snug ${subColor}`}>{sub}</p>
        )}
      </div>
    </div>
  );
}

interface ActionCardProps {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  primary?: boolean;
}

function ActionCard({
  label,
  description,
  href,
  icon: Icon,
  color,
  bg,
  primary,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3.5 shadow-sm transition-all duration-150 ${
        primary
          ? "border-indigo-200 bg-indigo-50/70 hover:shadow-md hover:ring-1 hover:ring-indigo-300"
          : "border-slate-200 bg-white hover:shadow-md hover:border-indigo-200 hover:ring-1 hover:ring-indigo-200"
      }`}
    >
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}
      >
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold leading-tight ${primary ? "text-indigo-900" : "text-slate-900"}`}
        >
          {label}
        </p>
        <p
          className={`text-xs mt-0.5 truncate ${primary ? "text-indigo-600" : "text-slate-400"}`}
        >
          {description}
        </p>
      </div>
      <ArrowRight
        className={`h-4 w-4 shrink-0 transition-colors ${primary ? "text-indigo-400 group-hover:text-indigo-600" : "text-slate-300 group-hover:text-indigo-500"}`}
      />
    </Link>
  );
}

interface CalloutBannerProps {
  icon: React.ElementType;
  iconBg: string;
  title: string;
  body: string;
  cta: string;
  ctaHref: string;
  borderColor: string;
  bgColor: string;
  titleColor: string;
  bodyColor: string;
  ctaColor: string;
}

function CalloutBanner({
  icon: Icon,
  iconBg,
  title,
  body,
  cta,
  ctaHref,
  borderColor,
  bgColor,
  titleColor,
  bodyColor,
  ctaColor,
}: CalloutBannerProps) {
  return (
    <div
      className={`rounded-xl border ${borderColor} ${bgColor} px-5 py-4 flex items-start gap-4`}
    >
      <div
        className={`h-9 w-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${titleColor}`}>{title}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${bodyColor}`}>{body}</p>
      </div>
      <Link
        href={ctaHref}
        className={`shrink-0 text-xs font-semibold flex items-center gap-1 transition-colors ${ctaColor}`}
      >
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Role sections ────────────────────────────────────────────────────────────

function AdminSection() {
  const { stats, loading } = useOrgFullStats();
  const activePct =
    stats && stats.total > 0
      ? Math.round((stats.withAccounts / stats.total) * 100)
      : 0;
  const newPct =
    stats && stats.total > 0
      ? Math.round((stats.recentlyAdded / stats.total) * 100)
      : 0;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashStat
          label="Total Employees"
          value={stats?.total ?? null}
          sub="Across all departments"
          icon={Users}
          gradient="from-slate-50 to-slate-100/80"
          border="border-slate-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-slate-600"
          numColor="text-slate-900"
          labelColor="text-slate-600"
          subColor="text-slate-400"
          loading={loading}
          ring={{
            pct: 100,
            stroke: "stroke-slate-300",
            track: "stroke-slate-100",
          }}
        />
        <DashStat
          label="Active Accounts"
          value={stats?.withAccounts ?? null}
          sub={stats ? `${activePct}% of workforce` : undefined}
          icon={UserCheck}
          gradient="from-emerald-50 to-emerald-100/60"
          border="border-emerald-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-emerald-600"
          numColor="text-emerald-900"
          labelColor="text-emerald-700"
          subColor="text-emerald-500"
          loading={loading}
          ring={{
            pct: activePct,
            stroke: "stroke-emerald-500",
            track: "stroke-emerald-100",
          }}
        />
        <DashStat
          label="New This Month"
          value={stats?.recentlyAdded ?? null}
          sub="Added last 30 days"
          icon={TrendingUp}
          gradient="from-indigo-50 to-indigo-100/60"
          border="border-indigo-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-indigo-600"
          numColor="text-indigo-900"
          labelColor="text-indigo-700"
          subColor="text-indigo-400"
          loading={loading}
          ring={{
            pct: newPct,
            stroke: "stroke-indigo-500",
            track: "stroke-indigo-100",
          }}
        />
        <DashStat
          label="Departments"
          value={stats?.byDepartment.length ?? null}
          sub="Active departments"
          icon={Building2}
          gradient="from-violet-50 to-violet-100/60"
          border="border-violet-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-violet-600"
          numColor="text-violet-900"
          labelColor="text-violet-700"
          subColor="text-violet-400"
          loading={loading}
        />
      </div>

      <div>
        <SectionHeader
          title="Platform Management"
          subtitle="Core administrative functions for your organization"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <ActionCard
            label="People"
            description="Employee directory & onboarding"
            href="/hr"
            icon={Stethoscope}
            color="text-rose-600"
            bg="bg-rose-50"
          />
          {/* <ActionCard label="Operations" description="Teams, workflows & company structure" href="/operations" icon={Building2} color="text-blue-600" bg="bg-blue-50" /> */}
          <ActionCard
            label="Reports & Analytics"
            description="Performance data and insights"
            href="/reports"
            icon={BarChart3}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <ActionCard
            label="Platform Settings"
            description="Configure your workspace"
            href="/settings"
            icon={Settings}
            color="text-slate-600"
            bg="bg-slate-100"
          />
        </div>
      </div>

      {/* <div>
        <SectionHeader title="Additional Access" subtitle="Other areas you can manage" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard label="Committees" description="Manage committees and members" href="/operations/committees" icon={ShieldCheck} color="text-violet-600" bg="bg-violet-50" />
          <ActionCard label="Settings" description="Configure your organization" href="/settings" icon={Settings} color="text-slate-600" bg="bg-slate-100" />
        </div>
      </div> */}
    </section>
  );
}

function HrSection() {
  const { stats, loading } = useOrgFullStats();
  const activePct =
    stats && stats.total > 0
      ? Math.round((stats.withAccounts / stats.total) * 100)
      : 0;
  const pendingPct = 100 - activePct;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashStat
          label="Total Employees"
          value={stats?.total ?? null}
          sub="In your organization"
          icon={Users}
          gradient="from-slate-50 to-slate-100/80"
          border="border-slate-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-slate-600"
          numColor="text-slate-900"
          labelColor="text-slate-600"
          subColor="text-slate-400"
          loading={loading}
          ring={{
            pct: 100,
            stroke: "stroke-slate-300",
            track: "stroke-slate-100",
          }}
        />
        <DashStat
          label="Active Accounts"
          value={stats?.withAccounts ?? null}
          sub={stats ? `${activePct}% logged in` : undefined}
          icon={UserCheck}
          gradient="from-emerald-50 to-emerald-100/60"
          border="border-emerald-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-emerald-600"
          numColor="text-emerald-900"
          labelColor="text-emerald-700"
          subColor="text-emerald-500"
          loading={loading}
          ring={{
            pct: activePct,
            stroke: "stroke-emerald-500",
            track: "stroke-emerald-100",
          }}
        />
        <DashStat
          label="Pending Setup"
          value={stats?.withoutAccounts ?? null}
          sub="Password not yet set"
          icon={UserX}
          gradient="from-amber-50 to-amber-100/60"
          border="border-amber-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-amber-600"
          numColor="text-amber-900"
          labelColor="text-amber-700"
          subColor="text-amber-500"
          loading={loading}
          ring={{
            pct: pendingPct,
            stroke: "stroke-amber-400",
            track: "stroke-amber-100",
          }}
        />
        <DashStat
          label="New This Month"
          value={stats?.recentlyAdded ?? null}
          sub="Onboarded last 30 days"
          icon={TrendingUp}
          gradient="from-indigo-50 to-indigo-100/60"
          border="border-indigo-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-indigo-600"
          numColor="text-indigo-900"
          labelColor="text-indigo-700"
          subColor="text-indigo-400"
          loading={loading}
        />
      </div>

      <div>
        <SectionHeader
          title="People Operations"
          subtitle="Manage your organization's workforce and access HR analytics"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard
            label="People"
            description="View, search and manage all employees across departments"
            href="/hr"
            icon={Stethoscope}
            color="text-rose-600"
            bg="bg-rose-50"
            primary
          />
          <ActionCard
            label="HR Analytics"
            description="Workforce stats, role distribution and account setup"
            href="/hr/reports"
            icon={BarChart3}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
        </div>
      </div>
    </section>
  );
}

function ManagementSection() {
  const { stats: orgStats, loading: orgLoading } = useOrgFullStats();
  const { summary, loading: simsLoading } = useSimsSummary();

  const orgTotal = summary?.organization.total ?? null;
  const orgPending = summary
    ? (summary.organization.byStatus["UNDER_REVIEW"] ?? 0) +
      (summary.organization.byStatus["ON_HOLD"] ?? 0) +
      (summary.organization.byStatus["SELECTED_FOR_SGA"] ?? 0)
    : null;
  const orgImpl = summary
    ? (summary.organization.byStatus["APPROVED_FOR_IMPLEMENTATION"] ?? 0)
    : null;
  const implPct =
    orgTotal && orgImpl !== null && orgTotal > 0
      ? Math.round((orgImpl / orgTotal) * 100)
      : 0;
  const pendPct =
    orgTotal && orgPending !== null && orgTotal > 0
      ? Math.round((orgPending / orgTotal) * 100)
      : 0;
  const newPct =
    orgStats && orgStats.total > 0
      ? Math.round((orgStats.recentlyAdded / orgStats.total) * 100)
      : 0;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashStat
          label="Total Employees"
          value={orgStats?.total ?? null}
          sub="Across all departments"
          icon={Users}
          gradient="from-blue-50 to-blue-100/60"
          border="border-blue-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-blue-600"
          numColor="text-blue-900"
          labelColor="text-blue-700"
          subColor="text-blue-400"
          loading={orgLoading}
          ring={{
            pct: 100,
            stroke: "stroke-blue-300",
            track: "stroke-blue-100",
          }}
        />
        <DashStat
          label="New This Month"
          value={orgStats?.recentlyAdded ?? null}
          sub="Recent onboards"
          icon={TrendingUp}
          gradient="from-indigo-50 to-indigo-100/60"
          border="border-indigo-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-indigo-600"
          numColor="text-indigo-900"
          labelColor="text-indigo-700"
          subColor="text-indigo-400"
          loading={orgLoading}
          ring={{
            pct: newPct,
            stroke: "stroke-indigo-500",
            track: "stroke-indigo-100",
          }}
        />
        <DashStat
          label="Org Suggestions"
          value={orgTotal}
          sub="Total ideas submitted"
          icon={Lightbulb}
          gradient="from-amber-50 to-amber-100/60"
          border="border-amber-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-amber-600"
          numColor="text-amber-900"
          labelColor="text-amber-700"
          subColor="text-amber-400"
          loading={simsLoading}
          ring={{
            pct: pendPct,
            stroke: "stroke-amber-400",
            track: "stroke-amber-100",
          }}
        />
        <DashStat
          label="Approved"
          value={orgImpl}
          sub={orgTotal ? `${implPct}% of ideas actioned` : undefined}
          icon={CheckCheck}
          gradient="from-emerald-50 to-emerald-100/60"
          border="border-emerald-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-emerald-600"
          numColor="text-emerald-900"
          labelColor="text-emerald-700"
          subColor="text-emerald-500"
          loading={simsLoading}
          ring={{
            pct: implPct,
            stroke: "stroke-emerald-500",
            track: "stroke-emerald-100",
          }}
        />
      </div>

      <div>
        <SectionHeader
          title="Organization Overview"
          subtitle="Monitor performance and review your organization's activities"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* <ActionCard label="Operations" description="Teams and workflow oversight" href="/operations" icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" /> */}
          <ActionCard
            label="Committees"
            description="Review and monitor committees"
            href="/operations/committees"
            icon={ShieldCheck}
            color="text-violet-600"
            bg="bg-violet-50"
          />
          <ActionCard
            label="Reports & Analytics"
            description="Organization performance data"
            href="/reports"
            icon={BarChart3}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <ActionCard
            label="My Profile"
            description="View and update your details"
            href="/operations/employees/me"
            icon={UserCircle}
            color="text-slate-600"
            bg="bg-slate-100"
          />
        </div>
      </div>
    </section>
  );
}

function DeptSimsDonut({
  summary,
  loading,
}: {
  summary: SuggestionSummary | null;
  loading: boolean;
}) {
  const dept = summary?.department;
  const total = dept?.total ?? 0;
  const review = dept?.byStatus["UNDER_REVIEW"] ?? 0;
  const onHold = dept?.byStatus["ON_HOLD"] ?? 0;
  const sga = dept?.byStatus["SELECTED_FOR_SGA"] ?? 0;
  const approved = dept?.byStatus["APPROVED_FOR_IMPLEMENTATION"] ?? 0;
  const rejected = dept?.byStatus["REJECTED"] ?? 0;
  const other = Math.max(
    0,
    total - review - onHold - sga - approved - rejected,
  );

  const r = 46;
  const circ = 2 * Math.PI * r;

  const segments =
    total > 0
      ? [
          {
            label: "Under Review",
            value: review,
            color: "#f59e0b",
            dot: "bg-amber-400",
          },
          {
            label: "On Hold",
            value: onHold,
            color: "#f97316",
            dot: "bg-orange-400",
          },
          {
            label: "Selected for SGA",
            value: sga,
            color: "#6366f1",
            dot: "bg-indigo-500",
          },
          {
            label: "Approved",
            value: approved,
            color: "#10b981",
            dot: "bg-emerald-500",
          },
          {
            label: "Rejected",
            value: rejected,
            color: "#ef4444",
            dot: "bg-red-400",
          },
          {
            label: "Other",
            value: other,
            color: "#94a3b8",
            dot: "bg-slate-300",
          },
        ].filter((s) => s.value > 0)
      : [];

  let cumulative = 0;
  const rendered = segments.map((s) => {
    const dash = (s.value / total) * circ;
    const offset = cumulative;
    cumulative += dash;
    return { ...s, dash, offset };
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Layers className="h-4 w-4 text-slate-400" />
        <p className="text-sm font-bold text-slate-900">
          Department Suggestions
        </p>
        <Link
          href="/sims"
          className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
        >
          View in SIMS <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24 gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div
            className="relative shrink-0"
            style={{ width: 120, height: 120 }}
          >
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              className="-rotate-90"
            >
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="14"
              />
              {total === 0 ? (
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="14"
                  strokeDasharray={`${circ} 0`}
                />
              ) : (
                rendered.map((seg, i) => (
                  <circle
                    key={i}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={`${seg.dash} ${circ - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    className="transition-all duration-700"
                  />
                ))
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-slate-900 leading-none">
                {total}
              </span>
              <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                total
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3 min-w-0">
            {[
              { label: "Under Review", value: review, dot: "bg-amber-400" },
              { label: "Approved", value: approved, dot: "bg-emerald-500" },
              { label: "Rejected", value: rejected, dot: "bg-red-500" },
              { label: "Other", value: other, dot: "bg-slate-300" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 min-w-0">
                <span
                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.dot}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 leading-none">
                    {item.value}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {item.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeptContributionDonut({
  summary,
  loading,
}: {
  summary: SuggestionSummary | null;
  loading: boolean;
}) {
  const deptTotal = summary?.department.total ?? 0;
  const orgTotal = summary?.organization.total ?? 0;
  const pct = orgTotal > 0 ? Math.round((deptTotal / orgTotal) * 100) : 0;

  const r = 46;
  const circ = 2 * Math.PI * r;
  const deptDash = orgTotal > 0 ? (deptTotal / orgTotal) * circ : 0;

  const topCategory = summary?.department.byCategory
    ? Object.entries(summary.department.byCategory).sort(
        ([, a], [, b]) => b - a,
      )[0]
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Building2 className="h-4 w-4 text-slate-400" />
        <p className="text-sm font-bold text-slate-900">Department Overview</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24 gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut */}
          <div
            className="relative shrink-0"
            style={{ width: 120, height: 120 }}
          >
            <svg
              width="120"
              height="120"
              viewBox="0 0 120 120"
              className="-rotate-90"
            >
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="14"
              />
              {orgTotal > 0 ? (
                <>
                  <circle
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="14"
                    strokeDasharray={`${circ} 0`}
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="14"
                    strokeDasharray={`${deptDash} ${circ - deptDash}`}
                    strokeDashoffset={0}
                    className="transition-all duration-700"
                  />
                </>
              ) : (
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="14"
                  strokeDasharray={`${circ} 0`}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-slate-900 leading-none">
                {pct}%
              </span>
              <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                share
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-none">
                  {deptTotal}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Your department
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-none">
                  {orgTotal}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Org total</p>
              </div>
            </div>
            {topCategory && (
              <div className="pt-2.5 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">
                  Top category
                </p>
                <p className="text-xs font-semibold text-indigo-600 mt-1 truncate capitalize">
                  {topCategory[0].replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
            )}
            {!topCategory && orgTotal === 0 && (
              <p className="text-xs text-slate-400">No suggestions yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HodSection() {
  const { summary, loading } = useSimsSummary();

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DeptSimsDonut summary={summary} loading={loading} />
        <DeptContributionDonut summary={summary} loading={loading} />
      </div>

      <CalloutBanner
        icon={ClipboardList}
        iconBg="bg-amber-500"
        title="Review Queue"
        body="Suggestions from your department are waiting for your review and feedback."
        cta="Review now"
        ctaHref="/sims/queue"
        borderColor="border-amber-100"
        bgColor="bg-amber-50/60"
        titleColor="text-amber-900"
        bodyColor="text-amber-700"
        ctaColor="text-amber-700 hover:text-amber-900"
      />

      <div>
        <SectionHeader
          title="Department Management"
          subtitle="Lead your team and manage department activities"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <ActionCard
            label="Review Queue"
            description="Suggestions awaiting your review"
            href="/sims/queue"
            icon={ClipboardList}
            color="text-amber-600"
            bg="bg-amber-50"
            primary
          />
          <ActionCard
            label="My Team"
            description="View employees in your department"
            href="/department"
            icon={Users}
            color="text-indigo-600"
            bg="bg-indigo-50"
          />
          <ActionCard
            label="My Suggestions"
            description="Track your submitted ideas"
            href="/sims/my-suggestions"
            icon={ListChecks}
            color="text-violet-600"
            bg="bg-violet-50"
          />
          <ActionCard
            label="My Profile"
            description="View and update your details"
            href="/operations/employees/me"
            icon={UserCircle}
            color="text-slate-600"
            bg="bg-slate-100"
          />
        </div>
      </div>
    </section>
  );
}

function EmployeeSection() {
  const { summary, loading } = useSimsSummary();

  const orgTotal = summary?.organization.total ?? null;
  const orgReview = summary
    ? (summary.organization.byStatus["UNDER_REVIEW"] ?? 0)
    : null;
  const orgImpl = summary
    ? (summary.organization.byStatus["APPROVED_FOR_IMPLEMENTATION"] ?? 0)
    : null;
  const deptTotal = summary?.department.total ?? null;
  const implPct =
    orgTotal && orgTotal > 0 && orgImpl !== null
      ? Math.round((orgImpl / orgTotal) * 100)
      : 0;
  const reviewPct =
    orgTotal && orgTotal > 0 && orgReview !== null
      ? Math.round((orgReview / orgTotal) * 100)
      : 0;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashStat
          label="Org Suggestions"
          value={orgTotal}
          sub="Ideas across your org"
          icon={Lightbulb}
          gradient="from-amber-50 to-amber-100/60"
          border="border-amber-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-amber-600"
          numColor="text-amber-900"
          labelColor="text-amber-700"
          subColor="text-amber-400"
          loading={loading}
          ring={{
            pct: 100,
            stroke: "stroke-amber-300",
            track: "stroke-amber-100",
          }}
        />
        <DashStat
          label="Under Review"
          value={orgReview}
          sub="Awaiting evaluation"
          icon={Clock}
          gradient="from-indigo-50 to-indigo-100/60"
          border="border-indigo-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-indigo-600"
          numColor="text-indigo-900"
          labelColor="text-indigo-700"
          subColor="text-indigo-400"
          loading={loading}
          ring={{
            pct: reviewPct,
            stroke: "stroke-indigo-500",
            track: "stroke-indigo-100",
          }}
        />
        <DashStat
          label="Approved"
          value={orgImpl}
          sub={orgTotal ? `${implPct}% approved` : "Ideas approved"}
          icon={CheckCheck}
          gradient="from-emerald-50 to-emerald-100/60"
          border="border-emerald-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-emerald-600"
          numColor="text-emerald-900"
          labelColor="text-emerald-700"
          subColor="text-emerald-500"
          loading={loading}
          ring={{
            pct: implPct,
            stroke: "stroke-emerald-500",
            track: "stroke-emerald-100",
          }}
        />
        <DashStat
          label="Dept Ideas"
          value={deptTotal}
          sub="From your department"
          icon={Building2}
          gradient="from-violet-50 to-violet-100/60"
          border="border-violet-200"
          iconBg="bg-white shadow-sm"
          iconColor="text-violet-600"
          numColor="text-violet-900"
          labelColor="text-violet-700"
          subColor="text-violet-400"
          loading={loading}
        />
      </div>

      <CalloutBanner
        icon={Lightbulb}
        iconBg="bg-indigo-600"
        title="Share your ideas"
        body="Your suggestions help improve the organization. Submit an idea and track its progress from review to implementation."
        cta="Submit"
        ctaHref="/sims/new"
        borderColor="border-indigo-100"
        bgColor="bg-indigo-50/60"
        titleColor="text-indigo-900"
        bodyColor="text-indigo-600"
        ctaColor="text-indigo-600 hover:text-indigo-800"
      />

      <div>
        <SectionHeader
          title="Your Workspace"
          subtitle="Everything you need to contribute and stay informed"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionCard
            label="Submit an Idea"
            description="Propose an improvement"
            href="/sims/new"
            icon={FileEdit}
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <ActionCard
            label="My Submissions"
            description="Track your suggestions"
            href="/sims/my-suggestions"
            icon={ListChecks}
            color="text-indigo-600"
            bg="bg-indigo-50"
          />
          <ActionCard
            label="My Profile"
            description="View and update your details"
            href="/operations/employees/me"
            icon={UserCircle}
            color="text-slate-600"
            bg="bg-slate-100"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DashboardRoleSection() {
  const role = useAuthStore((state) => state.user?.roleLevel);

  if (!role) return null;

  if (role === Role.SUPER_ADMIN || role === Role.ADMIN) return <AdminSection />;
  if (role === Role.HR) return <HrSection />;
  if (role === Role.MANAGEMENT) return <ManagementSection />;
  if (role === Role.HOD) return <HodSection />;
  if (role === Role.EMPLOYEE) return <EmployeeSection />;

  return null;
}
