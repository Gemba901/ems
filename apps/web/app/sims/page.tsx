"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService, Suggestion, SuggestionStatus, SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import {
  Plus, Download, EyeOff, Lightbulb,
  Clock, CheckCircle2, AlertCircle,
  ShieldCheck, BarChart2, Filter, Search,
  LayoutGrid, List, ChevronLeft, ChevronRight,
  Star, Trophy,
} from "lucide-react";
import { CommitteeService } from "@/services/committee.service";
import { useQuery } from "@tanstack/react-query";

const BOARD_PAGE_SIZE = 4;
const LIST_PAGE_SIZE = 10;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; badge: string }> = {
  QUALITY:    { label: "Quality",    badge: "bg-blue-100 text-blue-700"       },
  COST:       { label: "Cost",       badge: "bg-emerald-100 text-emerald-700" },
  DELIVERY:   { label: "Delivery",   badge: "bg-purple-100 text-purple-700"   },
  SAFETY:     { label: "Safety",     badge: "bg-red-100 text-red-700"         },
  MORALE:     { label: "Morale",     badge: "bg-amber-100 text-amber-700"     },
  TECHNOLOGY: { label: "Technology", badge: "bg-indigo-100 text-indigo-700"   },
  UNKNOWN:    { label: "Unknown",    badge: "bg-slate-100 text-slate-500"     },
};

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; dot: string; badge: string }> = {
  UNDER_REVIEW:                { label: "Under Review",      dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200"       },
  ON_HOLD:                     { label: "On Hold",           dot: "bg-orange-400",  badge: "bg-orange-50 text-orange-700 border-orange-200"    },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",  dot: "bg-indigo-500",  badge: "bg-indigo-50 text-indigo-700 border-indigo-200"    },
  APPROVED_FOR_IMPLEMENTATION: { label: "Implemented",        dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED:                    { label: "Rejected",          dot: "bg-red-400",     badge: "bg-red-50 text-red-700 border-red-200"             },
};

const BOARD_COLUMNS: { status: SuggestionStatus; emptyText: string }[] = [
  { status: "UNDER_REVIEW",                emptyText: "No suggestions under review" },
  { status: "ON_HOLD",                     emptyText: "None on hold"                },
  { status: "SELECTED_FOR_SGA",            emptyText: "None selected for SGA"       },
  { status: "APPROVED_FOR_IMPLEMENTATION", emptyText: "No implemented suggestions"   },
  { status: "REJECTED",                    emptyText: "No rejected suggestions"     },
];

const ALL_STATUSES: SuggestionStatus[] = [
  "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA", "APPROVED_FOR_IMPLEMENTATION", "REJECTED",
];
const ALL_CATEGORIES: SuggestionCategory[] = [
  "QUALITY", "COST", "DELIVERY", "SAFETY", "MORALE", "TECHNOLOGY", "UNKNOWN",
];

const SUGGESTION_POINTS: Record<SuggestionStatus, number> = {
  REJECTED:                    0,
  UNDER_REVIEW:                1,
  ON_HOLD:                     2,
  SELECTED_FOR_SGA:            3,
  APPROVED_FOR_IMPLEMENTATION: 5,
};

function calcSuggestionPoints(status: SuggestionStatus): number {
  return SUGGESTION_POINTS[status] ?? 0;
}

function PointsBadge({ status }: { status: SuggestionStatus }) {
  const pts = calcSuggestionPoints(status);
  const isImplemented = status === "APPROVED_FOR_IMPLEMENTATION";
  const isRejected    = status === "REJECTED";

  if (isRejected) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
        isImplemented
          ? "bg-amber-50 text-amber-600"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {isImplemented && <Star className="h-2.5 w-2.5 fill-amber-400 stroke-amber-400" />}
      {pts} {pts === 1 ? "pt" : "pts"}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportToCSV(suggestions: Suggestion[]) {
  const headers = ["Title", "Categories", "Status", "Weight", "Author", "Department", "Date"];
  const rows = suggestions.map((s) => [
    `"${s.title.replace(/"/g, '""')}"`,
    s.categories.join("+"),
    s.status,
    calcWeight(s.categories).toFixed(1),
    s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Anonymous",
    s.employee?.department?.name ?? "—",
    formatDate(s.createdAt),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "suggestions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CategoryBadges({ categories, max = 99 }: { categories: SuggestionCategory[]; max?: number }) {
  const visible = categories.slice(0, max);
  const rest = categories.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        return (
          <span key={c} className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${cfg.badge}`}>
            {cfg.label}
          </span>
        );
      })}
      {rest > 0 && <span className="text-[10px] font-medium text-slate-400">+{rest}</span>}
    </div>
  );
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SuggestionCard({
  suggestion: s,
  isReviewer,
  onClick,
}: {
  suggestion: Suggestion;
  isReviewer: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:shadow-md hover:border-slate-300 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 flex-1">{s.title}</p>
        <PointsBadge status={s.status} />
      </div>

      {s.categories.length > 0 && (
        <div className="mt-1.5">
          <CategoryBadges categories={s.categories} max={3} />
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
        {isReviewer ? (
          s.employee ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="h-5 w-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                {s.employee.firstName[0]}{s.employee.lastName[0]}
              </div>
              <span className="text-[11px] text-slate-400 truncate">
                {s.employee.firstName} {s.employee.lastName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-300">
              <EyeOff className="h-3 w-3" />
              <span className="text-[11px] italic text-slate-400">Anonymous</span>
            </div>
          )
        ) : (
          <span className="text-[11px] text-slate-400">
            {s.employee?.department?.name ?? "—"}
          </span>
        )}
        <span className="text-[11px] text-slate-400 shrink-0 ml-2">{formatDate(s.createdAt)}</span>
      </div>
    </button>
  );
}

const RANK_CHIP = [
  "bg-amber-100 text-amber-700",
  "bg-slate-200  text-slate-600",
  "bg-orange-100 text-orange-600",
];
const AVATAR_STYLE = [
  "bg-amber-100 text-amber-700",
  "bg-slate-200  text-slate-600",
  "bg-orange-100 text-orange-600",
];

const POINTS_LEGEND = [
  { label: "Under Review", pts: 1, star: false },
  { label: "On Hold",      pts: 2, star: false },
  { label: "SGA",          pts: 3, star: false },
  { label: "Implemented",  pts: 5, star: true  },
] as const;

type RankedEntry = {
  id: string; userId: string | null; name: string; dept: string;
  points: number; count: number; implemented: number;
};

function LeaderboardRow({
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

function TopContributors({
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


function BoardColumn({
  status,
  emptyText,
  suggestions,
  loading,
  isReviewer,
  onCardClick,
}: {
  status: SuggestionStatus;
  emptyText: string;
  suggestions: Suggestion[];
  loading: boolean;
  isReviewer: boolean;
  onCardClick: (id: string) => void;
}) {
  const [page, setPage] = useState(1);

  const items = useMemo(
    () => suggestions.filter((s) => s.status === status),
    [suggestions, status],
  );
  const totalPages = Math.ceil(items.length / BOARD_PAGE_SIZE);
  const paginated = items.slice((page - 1) * BOARD_PAGE_SIZE, page * BOARD_PAGE_SIZE);
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="flex flex-col w-72 shrink-0 bg-slate-50/70 rounded-xl overflow-hidden border border-slate-200">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-white">
        <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-semibold text-slate-700">{cfg.label}</span>
        <span className="ml-auto text-[11px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full tabular-nums">
          {loading ? "—" : items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-1.5 space-y-1.5 min-h-[80px]">
        {loading && (
          <div className="flex flex-col gap-1.5 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && paginated.length === 0 && (
          <div className="py-5 text-center">
            <p className="text-xs text-slate-400">{emptyText}</p>
          </div>
        )}
        {!loading &&
          paginated.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              isReviewer={isReviewer}
              onClick={() => onCardClick(s.id)}
            />
          ))}
      </div>

      {/* Column pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function SimsOverviewPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");
  const [listPage, setListPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const isReviewer =
    role === Role.SUPER_ADMIN ||
    role === Role.ADMIN ||
    role === Role.MANAGEMENT ||
    role === Role.HOD;

  useEffect(() => {
    if (role === Role.EMPLOYEE) router.replace("/sims/my-suggestions");
  }, [role, router]);

  const { data: allSuggestions = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["sims", role],
    queryFn: () =>
      role === Role.EMPLOYEE
        ? SimsService.getMine(accessToken!)
        : role === Role.HOD
          ? SimsService.getDepartment(accessToken!, { limit: 500 }).then((r) => r.data)
          : SimsService.getAll(accessToken!, { limit: 500 }).then((r) => r.data),
    enabled: !!accessToken && !!role,
  });

  const { data: myCommittees = [] } = useQuery({
    queryKey: ["my-committees"],
    queryFn: () => CommitteeService.getMyCommittees(accessToken!),
    enabled: !!accessToken,
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery({
    queryKey: ["sims-leaderboard"],
    queryFn: () => SimsService.getLeaderboard(accessToken!),
    enabled: !!accessToken,
  });

  const { data: summary = null } = useQuery({
    queryKey: ["sims-summary"],
    queryFn: () => SimsService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as Error).message : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSuggestions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (categoryFilter && !s.categories.includes(categoryFilter as SuggestionCategory)) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSuggestions, statusFilter, categoryFilter, search]);

  const listPaginated = useMemo(
    () => filtered.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE),
    [filtered, listPage],
  );
  const totalListPages = Math.ceil(filtered.length / LIST_PAGE_SIZE);

  const metrics = useMemo(() => {
    const total = allSuggestions.length;
    const pending = allSuggestions.filter((s) =>
      ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status),
    ).length;
    const approved = allSuggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const onHold = allSuggestions.filter((s) => s.status === "ON_HOLD").length;
    const successRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, pending, implemented: approved, needsClarification: onHold, successRate };
  }, [allSuggestions]);

  const pageTitle =
    role === Role.EMPLOYEE
      ? "My Suggestions"
      : role === Role.HOD
        ? "Department Suggestions"
        : "Suggestions & Ideas";

  const isFiltered = !!statusFilter || !!categoryFilter || !!search.trim();

  const handleCardClick = (id: string) => router.push(`/sims/${id}`);

  return (
    <ProtectedRoute
      allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}
    >
      <div className="max-w-[1400px] mx-2 sm:mx-5 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between gap-3 flex-nowrap">
  <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
    Suggestions & Ideas
  </h1>

  <div className="flex items-center gap-2 shrink-0">
    {isReviewer && (
      <button
        onClick={() => exportToCSV(filtered)}
        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    )}

    <Link
      href="/sims/new"
      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 whitespace-nowrap"
    >
      New
    </Link>
  </div>
</div>

        {/*  Leaderboard */}
        <TopContributors
          ranked={leaderboard}
          loading={leaderboardLoading}
          currentUserId={user?.userId}
        />
        

        {/* Reviewer metric cards */}
        {isReviewer && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: "Total", value: metrics.total, sub: "suggestions",
                icon: <Lightbulb className="h-4 w-4 text-blue-500" />, iconBg: "bg-blue-50", val: "text-slate-900",
              },
              {
                label: "Pending", value: metrics.pending,
                sub: metrics.pending > 0 ? "need attention" : "all clear",
                icon: <Clock className="h-4 w-4 text-amber-500" />, iconBg: "bg-amber-50",
                val: metrics.pending > 0 ? "text-amber-600" : "text-slate-900",
              },
              {
                label: "Approved", value: metrics.implemented,
                sub: `${metrics.successRate}% approval rate`,
                icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, iconBg: "bg-emerald-50",
                val: "text-emerald-600",
              },
              {
                label: "On Hold", value: metrics.needsClarification,
                sub: metrics.needsClarification > 0 ? "paused" : "none",
                icon: <AlertCircle className="h-4 w-4 text-orange-500" />, iconBg: "bg-orange-50",
                val: metrics.needsClarification > 0 ? "text-orange-600" : "text-slate-900",
              },
            ].map((m) => (
              <div key={m.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{m.label}</p>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${m.iconBg}`}>{m.icon}</div>
                </div>
                <p className={`text-2xl font-bold leading-none ${m.val}`}>{m.value}</p>
                <p className="text-[11px] text-slate-400 mt-1.5">{m.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar: view toggle + search + filters ────────────────────────── */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">

          {/* View toggle — hidden on mobile (board layout needs width) */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setView("board")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === "board"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>

          {/* Search + filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search suggestions…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setListPage(1); }}
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all w-full sm:w-52"
              />
            </div>

            {/* Mobile filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`sm:hidden flex items-center gap-2 self-start text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                isFiltered ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
              {isFiltered && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
            </button>

            {/* Filter selects */}
            <div className={`flex flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as SuggestionStatus | ""); setListPage(1); }}
                className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              >
                <option value="">All Statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value as SuggestionCategory | ""); setListPage(1); }}
                className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              >
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                ))}
              </select>
              {isFiltered && (
                <button
                  onClick={() => { setStatusFilter(""); setCategoryFilter(""); setSearch(""); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                >
                  Clear filters
                </button>
              )}
            </div>

            {!loading && (
              <p className="text-xs text-slate-400 shrink-0 hidden sm:block">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* ── Mobile: always card list ──────────────────────────────────────── */}
        <div className="sm:hidden space-y-2">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && listPaginated.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
              <Lightbulb className="h-7 w-7 text-slate-200" />
              <p className="text-sm font-medium">No suggestions found</p>
            </div>
          )}
          {!loading && !error && listPaginated.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/sims/${s.id}`)}
              className="w-full text-left bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-xl p-3.5 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-sm text-slate-900 leading-snug">{s.title}</p>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
              </div>
              <CategoryBadges categories={s.categories} max={3} />
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <StatusPill status={s.status} />
                  <PointsBadge status={s.status} />
                </div>
                <span className="text-[11px] text-slate-400">{formatDate(s.createdAt)}</span>
              </div>
              {isReviewer && s.employee && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {s.employee.firstName} {s.employee.lastName}
                  {s.employee.department && (
                    <span className="text-slate-300"> · {s.employee.department.name}</span>
                  )}
                </p>
              )}
            </button>
          ))}
          {!loading && totalListPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
                disabled={listPage === 1}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors text-slate-600"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400 px-2 tabular-nums">{listPage} / {totalListPages}</span>
              <button
                onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                disabled={listPage >= totalListPages}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors text-slate-600"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* ── Desktop: board view ────────────────────────────────────────────── */}
        {view === "board" && (
          <div className="hidden sm:block overflow-x-auto pb-4">
            <div className="flex items-start gap-3 min-w-max">
              {BOARD_COLUMNS.map(({ status, emptyText }) => (
                <BoardColumn
                  key={status}
                  status={status}
                  emptyText={emptyText}
                  suggestions={filtered}
                  loading={loading}
                  isReviewer={isReviewer}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Desktop: list view ─────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="hidden sm:block bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suggestion</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Points</th>
                    {isReviewer && (
                      <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted by</th>
                    )}
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading && (
                    <tr>
                      <td colSpan={isReviewer ? 6 : 5} className="px-5 py-14 text-center text-sm text-slate-400">
                        Loading suggestions…
                      </td>
                    </tr>
                  )}
                  {!loading && error && (
                    <tr>
                      <td colSpan={isReviewer ? 6 : 5} className="px-5 py-14 text-center text-sm text-red-500">
                        {error}
                      </td>
                    </tr>
                  )}
                  {!loading && !error && listPaginated.length === 0 && (
                    <tr>
                      <td colSpan={isReviewer ? 6 : 5} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Lightbulb className="h-7 w-7 text-slate-200" />
                          <p className="text-sm font-medium">No suggestions found</p>
                          <p className="text-xs">
                            {role === Role.EMPLOYEE
                              ? "You haven't submitted any ideas yet."
                              : "Try adjusting your filters."}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loading && !error && listPaginated.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/sims/${s.id}`)}
                      className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900 leading-snug">{s.title}</p>
                        <div className="mt-1.5">
                          <CategoryBadges categories={s.categories} />
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <PointsBadge status={s.status} />
                      </td>
                      {isReviewer && (
                        <td className="px-5 py-4">
                          {s.employee ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {s.employee.firstName[0]}{s.employee.lastName[0]}
                              </div>
                              <span className="text-sm text-slate-600 whitespace-nowrap">
                                {s.employee.firstName} {s.employee.lastName}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <EyeOff className="h-3.5 w-3.5" />
                              <span className="text-xs italic">Anonymous</span>
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-4 text-sm text-slate-400 whitespace-nowrap">
                        {formatDate(s.createdAt)}
                      </td>
                      <td className="pr-4 py-4">
                        <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loading && totalListPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  {Math.min((listPage - 1) * LIST_PAGE_SIZE + 1, filtered.length)}–
                  {Math.min(listPage * LIST_PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                    disabled={listPage === 1}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-400 px-2 tabular-nums">{listPage} / {totalListPages}</span>
                  <button
                    onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                    disabled={listPage >= totalListPages}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
