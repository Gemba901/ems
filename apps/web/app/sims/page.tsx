"use client";

import { useEffect, useState, useMemo } from "react";
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
  Clock, CheckCircle2, AlertCircle, ChevronRight,
  ShieldCheck, BarChart2, Filter,
} from "lucide-react";
import { CommitteeService } from "@/services/committee.service";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 10;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; badge: string }> = {
  QUALITY:    { label: "Quality",    badge: "bg-blue-100 text-blue-700"     },
  COST:       { label: "Cost",       badge: "bg-emerald-100 text-emerald-700" },
  DELIVERY:   { label: "Delivery",   badge: "bg-purple-100 text-purple-700" },
  SAFETY:     { label: "Safety",     badge: "bg-red-100 text-red-700"       },
  MORALE:     { label: "Morale",     badge: "bg-amber-100 text-amber-700"   },
  TECHNOLOGY: { label: "Technology", badge: "bg-indigo-100 text-indigo-700" },
  UNKNOWN:    { label: "Unknown",    badge: "bg-slate-100 text-slate-500"   },
};

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; dot: string; text: string; badge: string }> = {
  UNDER_REVIEW:                { label: "Under Review",      dot: "bg-amber-400",   text: "text-amber-700",   badge: "bg-amber-50 text-amber-700 border-amber-200"      },
  ON_HOLD:                     { label: "On Hold",           dot: "bg-orange-400",  text: "text-orange-700",  badge: "bg-orange-50 text-orange-700 border-orange-200"   },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",  dot: "bg-indigo-500",  text: "text-indigo-700",  badge: "bg-indigo-50 text-indigo-700 border-indigo-200"   },
  APPROVED_FOR_IMPLEMENTATION: { label: "Approved",          dot: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED:                    { label: "Rejected",          dot: "bg-red-400",     text: "text-red-700",     badge: "bg-red-50 text-red-700 border-red-200"            },
};

const ALL_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW","ON_HOLD","SELECTED_FOR_SGA","APPROVED_FOR_IMPLEMENTATION","REJECTED"];
const ALL_CATEGORIES: SuggestionCategory[] = ["QUALITY","COST","DELIVERY","SAFETY","MORALE","TECHNOLOGY","UNKNOWN"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportToCSV(suggestions: Suggestion[]) {
  const headers = ["Title","Categories","Status","Weight","Author","Department","Date"];
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
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "suggestions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CategoryBadges({ categories, max = 99 }: { categories: SuggestionCategory[]; max?: number }) {
  const visible = categories.slice(0, max);
  const rest    = categories.length - visible.length;
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

export default function SimsOverviewPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [statusFilter,   setStatusFilter]   = useState<SuggestionStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");
  const [page,           setPage]           = useState(1);
  const [showFilters,    setShowFilters]    = useState(false);

  const isReviewer = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT || role === Role.HOD;

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

  const { data: summary = null } = useQuery({
    queryKey: ["sims-summary"],
    queryFn: () => SimsService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const error = queryError ? (queryError as any).message : null;

  useEffect(() => { setPage(1); }, [statusFilter, categoryFilter]);

  const filtered = useMemo(() =>
    allSuggestions.filter((s) => {
      if (statusFilter   && s.status !== statusFilter)                                     return false;
      if (categoryFilter && !s.categories.includes(categoryFilter as SuggestionCategory)) return false;
      return true;
    }),
    [allSuggestions, statusFilter, categoryFilter],
  );

  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const metrics = useMemo(() => {
    const total       = allSuggestions.length;
    const pending     = allSuggestions.filter((s) => ["UNDER_REVIEW","ON_HOLD","SELECTED_FOR_SGA"].includes(s.status)).length;
    const approved    = allSuggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const onHold      = allSuggestions.filter((s) => s.status === "ON_HOLD").length;
    const successRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, pending, implemented: approved, needsClarification: onHold, successRate };
  }, [allSuggestions]);

  const pageTitle = role === Role.EMPLOYEE ? "My Suggestions" : role === Role.HOD ? "Department Suggestions" : "Suggestions & Ideas";
  const pageDesc  = role === Role.EMPLOYEE
    ? "Track your submitted ideas and their review status."
    : role === Role.HOD
      ? "Review and respond to suggestions from your department."
      : "Manage suggestions from across the organisation.";

  const isFiltered = !!statusFilter || !!categoryFilter;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="max-w-7xl mx-2 sm:mx-5 space-y-5 ">

        {/* ── Page header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{pageDesc}</p>
            {myCommittees.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {myCommittees.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    <ShieldCheck className="h-3 w-3" />{c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isReviewer && (
              <button
                onClick={() => exportToCSV(filtered)}
                title="Export CSV"
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            <Link
              href="/sims/new"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>New Suggestion</span>
            </Link>
          </div>
        </div>

        {/* ── Employee summary cards ───────────────────────────────────────────── */}
        {role === Role.EMPLOYEE && !loading && summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <p className="text-sm font-bold text-slate-800">Department</p>
              </div>
              <p className="text-3xl font-bold text-slate-900">{summary.department.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">suggestions from your department</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(summary.department.byStatus).map(([s, n]) => (
                  <span key={s} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[s as SuggestionStatus]?.badge ?? "bg-slate-50 text-slate-600 border-slate-100"}`}>
                    {STATUS_CONFIG[s as SuggestionStatus]?.label ?? s}: {n}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <BarChart2 className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <p className="text-sm font-bold text-slate-800">Company-wide</p>
              </div>
              <p className="text-3xl font-bold text-slate-900">{summary.organization.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">suggestions across the organisation</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(summary.organization.byCategory).map(([c, n]) => {
                  const cfg = CATEGORY_CONFIG[c as SuggestionCategory];
                  return cfg ? (
                    <span key={c} className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${cfg.badge}`}>
                      {cfg.label}: {n}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Reviewer metric cards ────────────────────────────────────────────── */}
        {isReviewer && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total",         value: metrics.total,              sub: "suggestions",                                       icon: <Lightbulb className="h-4 w-4 text-blue-500" />,   iconBg: "bg-blue-50",   val: "text-slate-900"   },
              { label: "Pending",       value: metrics.pending,            sub: metrics.pending > 0 ? "need attention" : "all clear", icon: <Clock className="h-4 w-4 text-amber-500" />,     iconBg: "bg-amber-50",  val: metrics.pending > 0 ? "text-amber-600" : "text-slate-900" },
              { label: "Approved",      value: metrics.implemented,        sub: `${metrics.successRate}% approval rate`,              icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, iconBg: "bg-emerald-50", val: "text-emerald-600" },
              { label: "On Hold",       value: metrics.needsClarification, sub: metrics.needsClarification > 0 ? "paused" : "none",  icon: <AlertCircle className="h-4 w-4 text-orange-500" />, iconBg: "bg-orange-50", val: metrics.needsClarification > 0 ? "text-orange-600" : "text-slate-900" },
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

        {/* ── Suggestions ──────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">

          {/* Filter bar */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
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

            <div className={`flex flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as SuggestionStatus | "")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              >
                <option value="">All Statuses</option>
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as SuggestionCategory | "")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              >
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
              </select>
              {isFiltered && (
                <button
                  onClick={() => { setStatusFilter(""); setCategoryFilter(""); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear
                </button>
              )}
            </div>

            {!loading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 shrink-0 hidden sm:block">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* ── Mobile: card grid ─────────────────────────────────────────────── */}
          <div className="sm:hidden p-3 space-y-2">
            {loading && (
              <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
            )}
            {!loading && error && (
              <p className="py-10 text-center text-sm text-red-500">{error}</p>
            )}
            {!loading && !error && paginated.length === 0 && (
              <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                <Lightbulb className="h-7 w-7 text-slate-200" />
                <p className="text-sm font-medium">No suggestions found</p>
              </div>
            )}
            {!loading && !error && paginated.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/sims/${s.id}`)}
                className="w-full text-left bg-slate-50 hover:bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm rounded-xl p-3.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-sm text-slate-900 leading-snug">{s.title}</p>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                </div>
                <CategoryBadges categories={s.categories} max={3} />
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
                  <StatusPill status={s.status} />
                  <span className="text-[11px] text-slate-400">{formatDate(s.createdAt)}</span>
                </div>
                {isReviewer && s.employee && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {s.employee.firstName} {s.employee.lastName}
                    {s.employee.department && <span className="text-slate-300"> · {s.employee.department.name}</span>}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* ── Desktop: table ────────────────────────────────────────────────── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Suggestion</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  {isReviewer && (
                    <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted by</th>
                  )}
                  <th className="px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading && (
                  <tr><td colSpan={isReviewer ? 5 : 4} className="px-5 py-14 text-center text-sm text-slate-400">Loading suggestions…</td></tr>
                )}
                {!loading && error && (
                  <tr><td colSpan={isReviewer ? 5 : 4} className="px-5 py-14 text-center text-sm text-red-500">{error}</td></tr>
                )}
                {!loading && !error && paginated.length === 0 && (
                  <tr>
                    <td colSpan={isReviewer ? 5 : 4} className="px-5 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Lightbulb className="h-7 w-7 text-slate-200" />
                        <p className="text-sm font-medium">No suggestions found</p>
                        <p className="text-xs">{role === Role.EMPLOYEE ? "You haven't submitted any ideas yet." : "Try adjusting your filters."}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !error && paginated.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/sims/${s.id}`)}
                    className="hover:bg-slate-50/60 cursor-pointer group transition-colors"
                  >
                    {/* Title + categories */}
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900 leading-snug">{s.title}</p>
                      <div className="mt-1.5">
                        <CategoryBadges categories={s.categories} />
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <StatusPill status={s.status} />
                    </td>

                    {/* Author (reviewer only) */}
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

                    {/* Date */}
                    <td className="px-5 py-4 text-sm text-slate-400 whitespace-nowrap">
                      {formatDate(s.createdAt)}
                    </td>

                    {/* Chevron */}
                    <td className="pr-4 py-4">
                      <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 text-center sm:text-left">
                {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center justify-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-400 px-2 tabular-nums">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
