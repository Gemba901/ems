"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService, Suggestion, SuggestionStatus, SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import {
  Download, EyeOff, Lightbulb,
  Filter, Search,
  LayoutGrid, List, ChevronLeft, ChevronRight,
  Star,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const BOARD_PAGE_SIZE = 4;
const LIST_PAGE_SIZE = 10;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; dot: string; text: string }> = {
  QUALITY:    { label: "Quality",    dot: "bg-blue-500",    text: "text-blue-600"    },
  COST:       { label: "Cost",       dot: "bg-amber-500",   text: "text-amber-600"   },
  DELIVERY:   { label: "Delivery",   dot: "bg-emerald-500", text: "text-emerald-600" },
  SAFETY:     { label: "Safety",     dot: "bg-red-500",     text: "text-red-600"     },
  MORALE:     { label: "Morale",     dot: "bg-rose-500",    text: "text-rose-600"    },
  TECHNOLOGY: { label: "Technology", dot: "bg-indigo-500",  text: "text-indigo-600"  },
  UNKNOWN:    { label: "Unknown",    dot: "bg-slate-400",   text: "text-slate-500"   },
};

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; dot: string; badge: string }> = {
  WAITING_FOR_REVIEW:          { label: "Waiting for Review", dot: "bg-slate-400",   badge: "bg-slate-50 text-slate-600 border-slate-200"        },
  UNDER_REVIEW:                { label: "Under Review",      dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200"       },
  ON_HOLD:                     { label: "On Hold",           dot: "bg-orange-400",  badge: "bg-orange-50 text-orange-700 border-orange-200"    },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",  dot: "bg-indigo-500",  badge: "bg-indigo-50 text-indigo-700 border-indigo-200"    },
  APPROVED_FOR_IMPLEMENTATION: { label: "Approved",           dot: "bg-teal-500",    badge: "bg-teal-50 text-teal-700 border-teal-200"           },
  IMPLEMENTED:                 { label: "Implemented",        dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED:                    { label: "Rejected",          dot: "bg-red-400",     badge: "bg-red-50 text-red-700 border-red-200"             },
};

const BOARD_COLUMNS: { status: SuggestionStatus; emptyText: string }[] = [
  { status: "WAITING_FOR_REVIEW",          emptyText: "Nothing waiting for review"  },
  { status: "UNDER_REVIEW",                emptyText: "No suggestions under review" },
  { status: "ON_HOLD",                     emptyText: "None on hold"                },
  { status: "SELECTED_FOR_SGA",            emptyText: "None selected for SGA"       },
  { status: "APPROVED_FOR_IMPLEMENTATION", emptyText: "No approved suggestions"     },
  { status: "IMPLEMENTED",                 emptyText: "No implemented suggestions"  },
  { status: "REJECTED",                    emptyText: "No rejected suggestions"     },
];

const ALL_STATUSES: SuggestionStatus[] = [
  "WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA",
  "APPROVED_FOR_IMPLEMENTATION", "IMPLEMENTED", "REJECTED",
];
const ALL_CATEGORIES: SuggestionCategory[] = [
  "QUALITY", "COST", "DELIVERY", "SAFETY", "MORALE", "TECHNOLOGY", "UNKNOWN",
];

// 1 point once a suggestion is approved for implementation, plus 1 more once it's
// actually implemented — 2 points max per suggestion.
function calcSuggestionPoints(status: SuggestionStatus): number {
  let pts = 0;
  if (status === "APPROVED_FOR_IMPLEMENTATION" || status === "IMPLEMENTED") pts += 1;
  if (status === "IMPLEMENTED") pts += 1;
  return pts;
}

function PointsBadge({ status }: { status: SuggestionStatus }) {
  const pts = calcSuggestionPoints(status);
  const isImplemented = status === "IMPLEMENTED";
  const isRejected    = status === "REJECTED";

  if (isRejected || pts === 0) return null;

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
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {visible.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        return (
          <span key={c} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
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
  onClick,
}: {
  suggestion: Suggestion;
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
        {s.employee ? (
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
        )}
        <span className="text-[11px] text-slate-400 shrink-0 ml-2">{formatDate(s.createdAt)}</span>
      </div>
    </button>
  );
}

function BoardColumn({
  status,
  emptyText,
  suggestions,
  loading,
  onCardClick,
}: {
  status: SuggestionStatus;
  emptyText: string;
  suggestions: Suggestion[];
  loading: boolean;
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

export default function SimsAllSuggestionsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");
  const [listPage, setListPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const { data: allSuggestions = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["sims-all-browse", role],
    queryFn: () =>
      role === Role.HOD
        ? SimsService.getDepartment(accessToken!, { limit: 500 }).then((r) => r.data)
        : SimsService.getAll(accessToken!, { limit: 500 }).then((r) => r.data),
    enabled: !!accessToken && !!role,
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

  const pageTitle = role === Role.HOD ? "Department Suggestions" : "All Suggestions";
  const isFiltered = !!statusFilter || !!categoryFilter || !!search.trim();

  const handleCardClick = (id: string) => router.push(`/sims/${id}`);

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD]}>
      <div className="mx-5 space-y-5">

        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">SIMS</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{pageTitle}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Browse, search, and filter {role === Role.HOD ? "your department's" : "the organisation's"} full suggestion history.
            </p>
          </div>

          <button
            onClick={() => exportToCSV(filtered)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

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
              {s.employee && (
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
          <div className="hidden sm:block pb-4">
            <div className="flex flex-wrap items-start gap-3">
              {BOARD_COLUMNS.map(({ status, emptyText }) => (
                <BoardColumn
                  key={status}
                  status={status}
                  emptyText={emptyText}
                  suggestions={filtered}
                  loading={loading}
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
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted by</th>
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-400">
                        Loading suggestions…
                      </td>
                    </tr>
                  )}
                  {!loading && error && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-sm text-red-500">
                        {error}
                      </td>
                    </tr>
                  )}
                  {!loading && !error && listPaginated.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <Lightbulb className="h-7 w-7 text-slate-200" />
                          <p className="text-sm font-medium">No suggestions found</p>
                          <p className="text-xs">Try adjusting your filters.</p>
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
