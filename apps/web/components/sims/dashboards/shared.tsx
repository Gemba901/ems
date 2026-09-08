"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Star, Trophy, ShieldCheck, ChevronRight, Lightbulb, EyeOff,
  Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Suggestion, SuggestionStatus, SuggestionCategory } from "@/services/sims.service";
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_DOTS, CATEGORY_COLORS, STATUS_COLORS,
  CHART_TOOLTIP_STYLE, StatusPill, CategoryPill, neutralPillClass, KpiCard, ChartCard,
} from "@/components/sims/sims-ui";
import { TargetDial } from "@/components/sims/TargetDial";

// ─── Status / category chart data + charts ─────────────────────────────────

// Every SuggestionStatus, always shown even at zero — so statuses like
// SELECTED_FOR_SGA never silently disappear just because no KPI tile buckets them.
export function StatusCountStrip({ suggestions }: { suggestions: Suggestion[] }) {
  const statuses = Object.keys(STATUS_LABELS) as SuggestionStatus[];
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((st) => {
        const count = suggestions.filter((s) => s.status === st).length;
        return (
          <span key={st} className={neutralPillClass}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOTS[st]}`} />
            {STATUS_LABELS[st]}
            <span className="text-slate-900 font-bold">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export function computeStatusChartData(suggestions: Suggestion[]) {
  const statuses = Object.keys(STATUS_COLORS) as SuggestionStatus[];
  return statuses
    .map((st) => ({
      name: STATUS_LABELS[st],
      value: suggestions.filter((s) => s.status === st).length,
      color: STATUS_COLORS[st],
    }))
    .filter((d) => d.value > 0);
}

export function computeCategoryChartData(suggestions: Suggestion[]) {
  const categories = Object.keys(CATEGORY_COLORS) as SuggestionCategory[];
  return categories
    .map((cat) => ({
      name: CATEGORY_LABELS[cat],
      value: suggestions.filter((s) => s.categories.includes(cat)).length,
      color: CATEGORY_COLORS[cat],
    }))
    .filter((d) => d.value > 0);
}

export function StatusDonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  if (data.length === 0) {
    return <p className="py-14 text-center text-sm text-slate-400">No data yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(val, name) => [val, name]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  if (data.length === 0) {
    return <p className="py-14 text-center text-sm text-slate-400">No data yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Bar dataKey="value" name="Suggestions" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Recent Activity table ──────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RecentActivityTable({
  suggestions,
  showAuthor = false,
  showDepartment = false,
  viewAllHref,
  viewAllLabel = "View all",
  emptyText = "No suggestions yet",
  limit = 7,
}: {
  suggestions: Suggestion[];
  showAuthor?: boolean;
  showDepartment?: boolean;
  viewAllHref: string;
  viewAllLabel?: string;
  emptyText?: string;
  limit?: number;
}) {
  const router = useRouter();
  const rows = [...suggestions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800">Recent Activity</p>
        <Link href={viewAllHref} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          {viewAllLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
          <Lightbulb className="h-6 w-6 text-slate-200" />
          <p className="text-sm">{emptyText}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suggestion</th>
                <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                {showAuthor && (
                  <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted by</th>
                )}
                {showDepartment && (
                  <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                )}
                <th className="px-5 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/sims/${s.id}`)}
                  className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900 leading-snug line-clamp-1">{s.title}</p>
                    {s.categories[0] && (
                      <div className="mt-1">
                        <CategoryPill category={s.categories[0]} />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <StatusPill status={s.status} />
                  </td>
                  {showAuthor && (
                    <td className="px-5 py-3 whitespace-nowrap">
                      {s.employee ? (
                        <span className="text-sm text-slate-600">
                          {s.employee.firstName} {s.employee.lastName}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <EyeOff className="h-3.5 w-3.5" />
                          <span className="text-xs italic">Anonymous</span>
                        </span>
                      )}
                    </td>
                  )}
                  {showDepartment && (
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-slate-500">
                      {s.employee?.department?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-5 py-3 text-sm text-slate-400 whitespace-nowrap">{formatDate(s.createdAt)}</td>
                  <td className="pr-4 py-3">
                    <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Leaderboards (moved as-is from the old page.tsx) ──────────────────────

export const RANK_CHIP = [
  "bg-amber-100 text-amber-700",
  "bg-slate-200  text-slate-600",
  "bg-orange-100 text-orange-600",
];
export const AVATAR_STYLE = [
  "bg-amber-100 text-amber-700",
  "bg-slate-200  text-slate-600",
  "bg-orange-100 text-orange-600",
];

export const POINTS_LEGEND = [
  { label: "Approved for implementation", pts: 1, star: false },
  { label: "Implemented",                 pts: 2, star: true  },
] as const;

export type RankedEntry = {
  id: string; userId: string | null; name: string; dept: string;
  points: number; count: number; implemented: number;
};

export type DepartmentRankedEntry = {
  id: string; name: string; marks: number; total: number;
};

export function LeaderboardRow({
  entry,
  rank,
  maxPoints,
  isYou = false,
}: {
  entry: RankedEntry;
  rank: number;
  maxPoints: number;
  isYou?: boolean;
}) {
  const barPct   = Math.round((entry.points / maxPoints) * 100);
  const isTop3   = rank <= 3;
  const initials = entry.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-colors ${isYou ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}`}>
      {/* Rank chip */}
      <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
        isYou   ? "bg-indigo-100 text-indigo-600"
        : isTop3 ? RANK_CHIP[rank - 1]
                 : "bg-slate-100 text-slate-400"
      }`}>
        {rank}
      </div>

      {/* Avatar */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
        isYou    ? "bg-indigo-100 text-indigo-600"
        : isTop3  ? AVATAR_STYLE[rank - 1]
                  : "bg-slate-100 text-slate-500"
      }`}>
        {initials}
      </div>

      {/* Name + dept */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-semibold truncate leading-tight ${isYou ? "text-indigo-700" : "text-slate-900"}`}>
            {entry.name}
          </p>
          {isYou && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600 shrink-0">
              You
            </span>
          )}
          {entry.implemented > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">
              <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />
              {entry.implemented}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 truncate mt-0.5">{entry.dept}</p>
      </div>

      {/* Progress bar */}
      <div className="hidden sm:block w-28 shrink-0">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isYou ? "bg-indigo-400" : isTop3 ? "bg-amber-400" : "bg-slate-300"
            }`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Points + idea count */}
      <div className="text-right shrink-0 min-w-[44px]">
        <p className={`text-sm font-bold leading-none tabular-nums ${
          isYou ? "text-indigo-600" : isTop3 ? "text-amber-600" : "text-slate-700"
        }`}>
          {entry.points} <span className="text-[11px] font-normal text-slate-400">pts</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} idea{entry.count !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

export function TopContributors({
  ranked,
  loading,
  currentUserId,
}: {
  ranked: RankedEntry[];
  loading: boolean;
  currentUserId: string | undefined;
}) {
  if (!loading && ranked.length === 0) return null;

  const top3      = ranked.slice(0, 3);
  const maxPoints = ranked[0]?.points ?? 1;

  const userIdx    = ranked.findIndex((r) => currentUserId && r.userId === currentUserId);
  const userEntry  = userIdx >= 0 ? ranked[userIdx] : null;
  const userRank   = userIdx + 1;
  const userInTop3 = userIdx >= 0 && userIdx < 3;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm font-semibold text-slate-900">Leaderboard</p>
        </div>
        <div className="flex items-center gap-3 sm:ml-auto flex-wrap">
          {POINTS_LEGEND.map(({ label, pts, star }) => (
            <span key={label} className="flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap">
              {star && <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />}
              {label} = {pts} {pts === 1 ? "pt" : "pts"}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-3 space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {/* Top 3 */}
          {top3.map((r, i) => (
            <LeaderboardRow
              key={r.id}
              entry={r}
              rank={i + 1}
              maxPoints={maxPoints}
              isYou={r.userId === currentUserId}
            />
          ))}

          {/* Current user row — only when they're outside top 3 and have suggestions */}
          {userEntry && !userInTop3 && (
            <>
              {/* Gap indicator */}
              <div className="flex items-center gap-3 px-5 py-1.5 bg-slate-50">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {userRank - 3} {userRank - 3 === 1 ? "place" : "places"} below
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <LeaderboardRow
                entry={userEntry}
                rank={userRank}
                maxPoints={maxPoints}
                isYou
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DepartmentLeaderboard({
  ranked,
  loading,
}: {
  ranked: DepartmentRankedEntry[];
  loading: boolean;
}) {
  if (!loading && ranked.length === 0) return null;

  const maxMarks = ranked[0]?.marks ?? 1;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
        <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-sm font-semibold text-slate-900">Department Marks</p>
        <span className="ml-auto text-[11px] text-slate-400">1 mark per implemented suggestion</span>
      </div>

      {loading ? (
        <div className="p-3 space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {ranked.slice(0, 5).map((d, i) => (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                i < 3 ? RANK_CHIP[i] : "bg-slate-100 text-slate-400"
              }`}>
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate leading-tight text-slate-900">{d.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{d.total} suggestion{d.total !== 1 ? "s" : ""}</p>
              </div>
              <div className="hidden sm:block w-28 shrink-0">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.round((d.marks / maxMarks) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 min-w-[44px]">
                <p className="text-sm font-bold leading-none tabular-nums text-emerald-600">{d.marks}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{d.marks === 1 ? "mark" : "marks"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scope toggle (org-wide vs. department-wise dashboards) ────────────────

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-slate-100 rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Org/department overview — shared by AdminDashboard and HodDashboard's
// "Organization" toggle. Read-only: no review affordances, since flipping
// the view never grants review rights outside one's own department. ──────

export function OrgOverviewView({
  suggestions,
  loading,
  leaderboard,
  leaderboardLoading,
  departmentLeaderboard,
  departmentLeaderboardLoading,
  currentUserId,
  totalLabel = "Total",
  totalSub = "Org-wide suggestions",
  recentActivityHref = "/sims/all",
  emptyText = "No suggestions submitted yet",
  employeeCount,
}: {
  suggestions: Suggestion[];
  loading: boolean;
  leaderboard: RankedEntry[];
  leaderboardLoading: boolean;
  departmentLeaderboard: DepartmentRankedEntry[];
  departmentLeaderboardLoading: boolean;
  currentUserId: string | undefined;
  totalLabel?: string;
  totalSub?: string;
  recentActivityHref?: string;
  emptyText?: string;
  employeeCount?: number;
}) {
  const kpis = useMemo(() => {
    const total = suggestions.length;
    const pending = suggestions.filter((s) =>
      ["WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status),
    ).length;
    const approved = suggestions.filter((s) =>
      s.status === "APPROVED_FOR_IMPLEMENTATION" || s.status === "IMPLEMENTED",
    ).length;
    const onHold = suggestions.filter((s) => s.status === "ON_HOLD").length;
    const implemented = suggestions.filter((s) => s.status === "IMPLEMENTED").length;
    return { total, pending, approved, onHold, implemented };
  }, [suggestions]);

  const statusData = useMemo(() => computeStatusChartData(suggestions), [suggestions]);
  const categoryData = useMemo(() => computeCategoryChartData(suggestions), [suggestions]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <KpiCard label={totalLabel} value={loading ? "—" : kpis.total} sub={totalSub} icon={<Lightbulb className="h-5 w-5 text-blue-600" />} accent="bg-blue-50" />
        <KpiCard label="Pending" value={loading ? "—" : kpis.pending} icon={<Clock className="h-5 w-5 text-amber-500" />} accent="bg-amber-50" />
        <KpiCard label="Approved" value={loading ? "—" : kpis.approved} sub="Approved / implemented" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} accent="bg-emerald-50" />
        <KpiCard label="On Hold" value={loading ? "—" : kpis.onHold} sub={kpis.onHold > 0 ? "paused" : "none"} icon={<AlertCircle className="h-5 w-5 text-orange-500" />} accent="bg-orange-50" />
      </div>

      {/* Per-status breakdown */}
      <StatusCountStrip suggestions={suggestions} />

      {/* Recent activity + leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <RecentActivityTable
            suggestions={suggestions}
            showAuthor
            showDepartment
            viewAllHref={recentActivityHref}
            viewAllLabel="View all"
            emptyText={emptyText}
          />
        </div>
        <div className="space-y-4">
          <TopContributors ranked={leaderboard} loading={leaderboardLoading} currentUserId={currentUserId} />
          <DepartmentLeaderboard ranked={departmentLeaderboard} loading={departmentLeaderboardLoading} />
        </div>
      </div>

      {/* Target dial + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {employeeCount !== undefined && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center justify-center">
            <TargetDial
              implemented={kpis.implemented}
              target={employeeCount * 4}
              title="Implementation target (4 per employee)"
            />
          </div>
        )}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${employeeCount !== undefined ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <ChartCard title="Status Breakdown" subtitle="By current status">
            <StatusDonutChart data={statusData} />
          </ChartCard>
          <ChartCard title="Category Mix" subtitle="By QCDSMT category">
            <CategoryBarChart data={categoryData} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
