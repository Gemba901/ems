"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService, Suggestion, SuggestionStatus, SuggestionCategory,
  SuggestionSummary, CATEGORY_WEIGHTS, calcWeight,
} from "@/services/sims.service";
import {
  Plus, Download, EyeOff, Eye, MoreHorizontal, Lightbulb,
  Clock, CheckCircle2, AlertCircle, Award, AlertTriangle, ChevronRight,
  ShieldCheck, BarChart2,
} from "lucide-react";
import { CommitteeService, MyCommittee } from "@/services/committee.service";

const PAGE_SIZE = 10;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; dot: string; badge: string }> = {
  QUALITY:    { label: "Quality",    dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700" },
  COST:       { label: "Cost",       dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  DELIVERY:   { label: "Delivery",   dot: "bg-purple-500",  badge: "bg-purple-100 text-purple-700" },
  SAFETY:     { label: "Safety",     dot: "bg-red-500",     badge: "bg-red-100 text-red-700" },
  MORALE:     { label: "Morale",     dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700" },
  TECHNOLOGY: { label: "Technology", dot: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700" },
  UNKNOWN:    { label: "Unknown",    dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-500" },
};

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; dot: string; text: string }> = {
  UNDER_REVIEW:                { label: "Under Review",               dot: "bg-amber-500",   text: "text-amber-700"   },
  ON_HOLD:                     { label: "On Hold",                    dot: "bg-orange-500",  text: "text-orange-700"  },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",           dot: "bg-indigo-500",  text: "text-indigo-700"  },
  APPROVED_FOR_IMPLEMENTATION: { label: "Approved for Implementation", dot: "bg-emerald-500", text: "text-emerald-700" },
  REJECTED:                    { label: "Rejected",                   dot: "bg-red-500",     text: "text-red-700"     },
};

const ALL_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW","ON_HOLD","SELECTED_FOR_SGA","APPROVED_FOR_IMPLEMENTATION","REJECTED"];
const ALL_CATEGORIES: SuggestionCategory[] = ["QUALITY","COST","DELIVERY","SAFETY","MORALE","TECHNOLOGY","UNKNOWN"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function exportToCSV(suggestions: Suggestion[]) {
  const headers = ["Title","Categories","Status","Weight","Author","Department","Date & Time"];
  const rows = suggestions.map((s) => [
    `"${s.title.replace(/"/g, '""')}"`,
    s.categories.join("+"),
    s.status,
    calcWeight(s.categories).toFixed(1),
    s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Anonymous",
    s.employee?.department?.name ?? "—",
    formatDateTime(s.createdAt),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "suggestions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CategoryBadges({ categories, showWeight, isReviewer }: { categories: SuggestionCategory[]; showWeight: boolean; isReviewer: boolean }) {
  const weight = calcWeight(categories);
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {categories.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        return (
          <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.badge}`}>
            {cfg.label}
          </span>
        );
      })}
      {showWeight && isReviewer && weight > 0 && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-100">
          W {weight.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export default function SimsOverviewPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [statusFilter,   setStatusFilter]   = useState<SuggestionStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");
  const [page, setPage] = useState(1);
  const [myCommittees, setMyCommittees] = useState<MyCommittee[]>([]);
  const [summary, setSummary] = useState<SuggestionSummary | null>(null);

  const isReviewer = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT || role === Role.HOD;

  useEffect(() => {
    if (!accessToken || !role) return;
    setLoading(true); setError(null);
    const fetch =
      role === Role.EMPLOYEE
        ? SimsService.getMine(accessToken)
        : role === Role.HOD
          ? SimsService.getDepartment(accessToken, { limit: 500 }).then((r) => r.data)
          : SimsService.getAll(accessToken, { limit: 500 }).then((r) => r.data);
    fetch.then(setAllSuggestions).catch((err) => setError(err.message)).finally(() => setLoading(false));
    CommitteeService.getMyCommittees(accessToken).then(setMyCommittees).catch(() => {});
    SimsService.getSummary(accessToken).then(setSummary).catch(() => {});
  }, [accessToken, role]);

  useEffect(() => { setPage(1); }, [statusFilter, categoryFilter]);

  const filtered = useMemo(() =>
    allSuggestions.filter((s) => {
      if (statusFilter   && s.status !== statusFilter)                       return false;
      if (categoryFilter && !s.categories.includes(categoryFilter as SuggestionCategory)) return false;
      return true;
    }),
    [allSuggestions, statusFilter, categoryFilter]
  );

  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const metrics = useMemo(() => {
    const total              = allSuggestions.length;
    const pending   = allSuggestions.filter((s) => ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status)).length;
    const approved  = allSuggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length;
    const onHold    = allSuggestions.filter((s) => s.status === "ON_HOLD").length;
    const successRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, pending, implemented: approved, needsClarification: onHold, successRate };
  }, [allSuggestions]);

  const recentWins = useMemo(() =>
    allSuggestions
      .filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3),
    [allSuggestions]
  );

  const stuckItems = useMemo(() =>
    allSuggestions.filter((s) => {
      if (!["UNDER_REVIEW", "SELECTED_FOR_SGA"].includes(s.status)) return false;
      return Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000) >= 7;
    }),
    [allSuggestions]
  );

  const clarifyItems = useMemo(() =>
    allSuggestions.filter((s) => s.status === "ON_HOLD"),
    [allSuggestions]
  );

  const pageTitle = role === Role.EMPLOYEE ? "My Suggestions" : role === Role.HOD ? "Department Suggestions" : "Suggestions & Ideas";
  const pageDesc  = role === Role.EMPLOYEE
    ? "Track your submitted ideas and their review status."
    : role === Role.HOD
      ? "Review and respond to suggestions from your department."
      : "Manage suggestions from across the organisation.";
  const colSpan = isReviewer ? 6 : 4;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            <p className="text-sm text-slate-500 mt-1">{pageDesc}</p>
            {myCommittees.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {myCommittees.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    <ShieldCheck className="h-3 w-3" />{c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isReviewer && (
              <button
                onClick={() => exportToCSV(filtered)}
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            )}
            <Link href="/sims/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> New Suggestion
            </Link>
          </div>
        </div>

        {/* Employee summary cards */}
        {role === Role.EMPLOYEE && !loading && summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-bold text-slate-800">Department Summary</p>
              </div>
              <p className="text-3xl font-bold text-slate-900">{summary.department.total}</p>
              <p className="text-xs text-slate-500 mt-1">total suggestions from your department</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(summary.department.byStatus).map(([s, n]) => (
                  <span key={s} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CONFIG[s as SuggestionStatus]?.text ?? "text-slate-600"} bg-slate-50 border border-slate-100`}>
                    {STATUS_CONFIG[s as SuggestionStatus]?.label ?? s}: {n}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="h-4 w-4 text-emerald-500" />
                <p className="text-sm font-bold text-slate-800">Company Summary</p>
              </div>
              <p className="text-3xl font-bold text-slate-900">{summary.organization.total}</p>
              <p className="text-xs text-slate-500 mt-1">total suggestions across the organisation</p>
              <div className="flex flex-wrap gap-2 mt-3">
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

        {/* Reviewer metric cards */}
        {isReviewer && !loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Suggestions",     value: metrics.total,              sub: null,                                                                          icon: <Lightbulb className="h-5 w-5 text-blue-600" />,   iconBg: "bg-blue-50" },
              { label: "Pending Review",         value: metrics.pending,            sub: metrics.pending > 0 ? <span className="text-amber-500">Requires attention</span> : null, icon: <Clock className="h-5 w-5 text-amber-500" />,     iconBg: "bg-amber-50" },
              { label: "Approved for Impl.",      value: metrics.implemented,        sub: <span className="text-emerald-600">Approval rate: {metrics.successRate}%</span>, icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, iconBg: "bg-emerald-50" },
              { label: "On Hold",               value: metrics.needsClarification, sub: metrics.needsClarification > 0 ? <span className="text-orange-500">Paused items</span> : null, icon: <AlertCircle className="h-5 w-5 text-orange-500" />, iconBg: "bg-orange-50" },
            ].map((m) => (
              <div key={m.label} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{m.label}</p>
                <div className="flex items-end justify-between mt-2">
                  <p className="text-3xl font-bold text-slate-900">{m.value}</p>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${m.iconBg}`}>{m.icon}</div>
                </div>
                {m.sub && <p className="text-xs font-medium mt-2">{m.sub}</p>}
              </div>
            ))}
          </div>
        )}


        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2.5">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SuggestionStatus | "")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
                <option value="">Status: All</option>
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as SuggestionCategory | "")}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all">
                <option value="">Category: All</option>
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
              </select>
            </div>
            {!loading && filtered.length > 0 && (
              <p className="text-xs text-slate-400 shrink-0">
                {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Title & Categories</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  {isReviewer && (
                    <>
                      <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Weight</th>
                      <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Author</th>
                      <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                    </>
                  )}
                  <th className="px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700">
                {loading && <tr><td colSpan={colSpan} className="px-6 py-14 text-center text-slate-400">Loading suggestions...</td></tr>}
                {!loading && error && <tr><td colSpan={colSpan} className="px-6 py-14 text-center text-red-500">{error}</td></tr>}
                {!loading && !error && paginated.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Lightbulb className="h-8 w-8 text-slate-200" />
                        <p className="text-sm font-medium">No suggestions found</p>
                        <p className="text-xs">{role === Role.EMPLOYEE ? "You haven't submitted any ideas yet." : "Try adjusting your filters."}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !error && paginated.map((s) => {
                  const status = STATUS_CONFIG[s.status];
                  const weight = calcWeight(s.categories);
                  const dt     = formatDateTime(s.createdAt);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 cursor-pointer group transition-colors" onClick={() => router.push(`/sims/${s.id}`)}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900 leading-snug">{s.title}</p>
                        <CategoryBadges categories={s.categories} showWeight={false} isReviewer={isReviewer} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${status.dot}`} />
                          <span className={`font-medium ${status.text}`}>{status.label}</span>
                        </span>
                      </td>
                      {isReviewer && (
                        <>
                          <td className="px-6 py-4">
                            <span className="text-xs font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-700">
                              {weight > 0 ? weight.toFixed(1) : "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {s.employee ? (
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {s.employee.firstName[0]}{s.employee.lastName[0]}
                                </div>
                                <span className="text-slate-700">{s.employee.firstName} {s.employee.lastName}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-slate-400"><EyeOff className="h-4 w-4" /><span className="text-sm italic">Anonymous</span></div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500">{s.employee?.department?.name ?? "—"}</td>
                        </>
                      )}
                      <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{dt}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); router.push(`/sims/${s.id}`); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} suggestions
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600">
                  Previous
                </button>
                <span className="text-xs text-slate-400 px-2">{page} / {totalPages || 1}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600">
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
