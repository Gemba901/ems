"use client";

import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/patterns/EmptyState";
import { SectionCard } from "@/components/patterns/SectionCard";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
            <span className="text-foreground font-bold">{count}</span>
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
    return <p className="py-14 text-center text-sm text-muted-foreground">No data yet</p>;
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
    return <p className="py-14 text-center text-sm text-muted-foreground">No data yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
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
    <SectionCard
      title="Recent activity"
      actions={
        <Link href={viewAllHref} className={buttonVariants({ variant: "outline" })}>
          {viewAllLabel}
          <ChevronRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <Table>
          <TableCaption className="sr-only">Recent suggestions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Suggestion</TableHead>
              <TableHead scope="col">Status</TableHead>
              {showAuthor && <TableHead scope="col">Submitted by</TableHead>}
              {showDepartment && <TableHead scope="col">Department</TableHead>}
              <TableHead scope="col">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((suggestion) => (
              <TableRow
                key={suggestion.id}
                onClick={() => router.push(`/sims/${suggestion.id}`)}
                className="cursor-pointer"
              >
                <TableCell>
                  <Link
                    href={`/sims/${suggestion.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="line-clamp-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {suggestion.title}
                  </Link>
                  {suggestion.categories[0] && (
                    <div className="mt-1"><CategoryPill category={suggestion.categories[0]} /></div>
                  )}
                </TableCell>
                <TableCell><StatusPill status={suggestion.status} /></TableCell>
                {showAuthor && (
                  <TableCell>
                    {suggestion.employee
                      ? `${suggestion.employee.firstName} ${suggestion.employee.lastName}`
                      : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><EyeOff aria-hidden="true" className="size-4" />Anonymous</span>}
                  </TableCell>
                )}
                {showDepartment && (
                  <TableCell>{suggestion.employee?.department?.name ?? "—"}</TableCell>
                )}
                <TableCell>{formatDate(suggestion.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

// ─── Leaderboards (moved as-is from the old page.tsx) ──────────────────────

export const RANK_CHIP = [
  "bg-warning-subtle text-warning",
  "bg-muted  text-muted-foreground",
  "bg-warning-subtle text-warning",
];
export const AVATAR_STYLE = [
  "bg-warning-subtle text-warning",
  "bg-muted  text-muted-foreground",
  "bg-warning-subtle text-warning",
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
    <div className={`flex items-center gap-3 px-5 py-3 transition-colors ${isYou ? "bg-accent/60" : "hover:bg-muted/60"}`}>
      {/* Rank chip */}
      <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
        isYou   ? "bg-accent text-primary"
        : isTop3 ? RANK_CHIP[rank - 1]
                 : "bg-muted text-muted-foreground"
      }`}>
        {rank}
      </div>

      {/* Avatar */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
        isYou    ? "bg-accent text-primary"
        : isTop3  ? AVATAR_STYLE[rank - 1]
                  : "bg-muted text-muted-foreground"
      }`}>
        {initials}
      </div>

      {/* Name + dept */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-semibold truncate leading-tight ${isYou ? "text-primary" : "text-foreground"}`}>
            {entry.name}
          </p>
          {isYou && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent text-primary shrink-0">
              You
            </span>
          )}
          {entry.implemented > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-warning-subtle text-warning shrink-0">
              <Star className="h-2.5 w-2.5 fill-warning stroke-warning" />
              {entry.implemented}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{entry.dept}</p>
      </div>

      {/* Progress bar */}
      <div className="hidden sm:block w-28 shrink-0">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isYou ? "bg-primary" : isTop3 ? "bg-warning" : "bg-muted-foreground"
            }`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>

      {/* Points + idea count */}
      <div className="text-right shrink-0 min-w-[44px]">
        <p className={`text-sm font-bold leading-none tabular-nums ${
          isYou ? "text-primary" : isTop3 ? "text-warning" : "text-foreground"
        }`}>
          {entry.points} <span className="text-[11px] font-normal text-muted-foreground">pts</span>
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{entry.count} idea{entry.count !== 1 ? "s" : ""}</p>
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
    <div className="bg-background border border-border rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm font-semibold text-foreground">Leaderboard</p>
        </div>
        <div className="flex items-center gap-3 sm:ml-auto flex-wrap">
          {POINTS_LEGEND.map(({ label, pts, star }) => (
            <span key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
              {star && <Star className="h-2.5 w-2.5 fill-warning stroke-warning" />}
              {label} = {pts} {pts === 1 ? "pt" : "pts"}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-3 space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
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
              <div className="flex items-center gap-3 px-5 py-1.5 bg-muted">
                <div className="h-px flex-1 bg-muted" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {userRank - 3} {userRank - 3 === 1 ? "place" : "places"} below
                </span>
                <div className="h-px flex-1 bg-muted" />
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
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <ShieldCheck className="h-4 w-4 text-success shrink-0" />
        <p className="text-sm font-semibold text-foreground">Department Marks</p>
        <span className="ml-auto text-[11px] text-muted-foreground">1 mark per implemented suggestion</span>
      </div>

      {loading ? (
        <div className="p-3 space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-11 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {ranked.slice(0, 5).map((d, i) => (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/60 transition-colors">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                i < 3 ? RANK_CHIP[i] : "bg-muted text-muted-foreground"
              }`}>
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate leading-tight text-foreground">{d.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{d.total} suggestion{d.total !== 1 ? "s" : ""}</p>
              </div>
              <div className="hidden sm:block w-28 shrink-0">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-700"
                    style={{ width: `${Math.round((d.marks / maxMarks) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 min-w-[44px]">
                <p className="text-sm font-bold leading-none tabular-nums text-success">{d.marks}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{d.marks === 1 ? "mark" : "marks"}</p>
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
    <div className="inline-flex items-center gap-0.5 bg-muted rounded-xl p-1">
      {options.map((opt) => (
        <Button variant="ghost"
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </Button>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label={totalLabel} value={loading ? "—" : kpis.total} sub={totalSub} icon={<Lightbulb className="h-5 w-5 text-info" />} accent="bg-info-subtle" />
        <KpiCard label="Pending" value={loading ? "—" : kpis.pending} icon={<Clock className="h-5 w-5 text-warning" />} accent="bg-warning-subtle" />
        <KpiCard label="Approved" value={loading ? "—" : kpis.approved} sub="Approved / implemented" icon={<CheckCircle2 className="h-5 w-5 text-success" />} accent="bg-success-subtle" />
        <KpiCard label="On Hold" value={loading ? "—" : kpis.onHold} sub={kpis.onHold > 0 ? "paused" : "none"} icon={<AlertCircle className="h-5 w-5 text-warning" />} accent="bg-warning-subtle" />
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
          <div className="bg-background border border-border rounded-xl p-6 flex items-center justify-center">
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
