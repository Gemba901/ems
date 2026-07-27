"use client";

import { useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService, Suggestion, SuggestionStatus, SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import { CommitteeService } from "@/services/committee.service";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download, Users, ShieldCheck, ChevronLeft, ChevronRight, EyeOff,
} from "lucide-react";

const PAGE_SIZE = 15;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; dot: string; text: string }> = {
  QUALITY:    { label: "Quality",    dot: "bg-blue-500",    text: "text-blue-600"    },
  COST:       { label: "Cost",       dot: "bg-amber-500",   text: "text-amber-600"   },
  DELIVERY:   { label: "Delivery",   dot: "bg-emerald-500", text: "text-emerald-600" },
  SAFETY:     { label: "Safety",     dot: "bg-red-500",     text: "text-red-600"     },
  MORALE:     { label: "Morale",     dot: "bg-rose-500",    text: "text-rose-600"    },
  TECHNOLOGY: { label: "Technology", dot: "bg-indigo-500",  text: "text-indigo-600"  },
  UNKNOWN:    { label: "Unknown",    dot: "bg-slate-400",   text: "text-slate-500"   },
};

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; badge: string }> = {
  WAITING_FOR_REVIEW:          { label: "Waiting for Review", badge: "bg-slate-50 text-slate-600 border-slate-200"     },
  UNDER_REVIEW:                { label: "Under Review",       badge: "bg-amber-50 text-amber-700 border-amber-200"    },
  ON_HOLD:                     { label: "On Hold",            badge: "bg-orange-50 text-orange-700 border-orange-200" },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",   badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  APPROVED_FOR_IMPLEMENTATION: { label: "Approved",           badge: "bg-teal-50 text-teal-700 border-teal-200"       },
  IMPLEMENTED:                 { label: "Implemented",        badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED:                    { label: "Rejected",           badge: "bg-red-50 text-red-700 border-red-200"          },
};

// Only statuses a suggestion can hold once forwarded to a committee (SELECTED_FOR_SGA -> IMPLEMENTED/REJECTED)
const REPORT_STATUSES: SuggestionStatus[] = ["SELECTED_FOR_SGA", "IMPLEMENTED", "REJECTED"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportToCSV(suggestions: Suggestion[]) {
  const headers = ["Title", "Categories", "Status", "Weight", "Author", "Department", "Forwarded"];
  const rows = suggestions.map((s) => [
    `"${s.title.replace(/"/g, '""')}"`,
    s.categories.join("+"),
    s.status,
    calcWeight(s.categories).toFixed(1),
    s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Anonymous",
    s.employee?.department?.name ?? "—",
    formatDate(s.forwardedToCommitteeAt),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "committee-report.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CategoryBadges({ categories }: { categories: SuggestionCategory[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {categories.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        return (
          <span key={c} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: SuggestionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

function DesignatedCommitteeControl() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: committees = [] } = useQuery({
    queryKey: ["committees-list"],
    queryFn: () => CommitteeService.list(accessToken!),
    enabled: !!accessToken,
  });

  const { data: designated } = useQuery({
    queryKey: ["committees-designated"],
    queryFn: () => CommitteeService.getDesignated(accessToken!),
    enabled: !!accessToken,
  });

  const setDesignatedMutation = useMutation({
    mutationFn: (committeeId: string) => CommitteeService.setDesignated(committeeId, accessToken!),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["committees-designated"] });
    },
    onError: (err: any) => setError(err.message),
  });

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-800">Designated SGA Committee</h2>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Suggestions an HOD marks "Selected for SGA" are automatically forwarded to this committee.
      </p>
      <select
        value={designated?.id ?? ""}
        onChange={(e) => e.target.value && setDesignatedMutation.mutate(e.target.value)}
        disabled={setDesignatedMutation.isPending}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
      >
        <option value="" disabled>Select a committee...</option>
        {committees.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>
      )}
    </div>
  );
}

export default function CommitteeReportPage() {
  const { user: authUser, accessToken } = useAuthStore();
  const role = authUser?.roleLevel;
  const isAdmin = role === Role.SUPER_ADMIN || role === Role.ADMIN;

  const [status, setStatus] = useState<SuggestionStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sims-committee-report", status, page],
    queryFn: () => SimsService.getCommitteeReport(accessToken!, {
      status: status || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    enabled: !!accessToken,
  });

  const suggestions = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-5 w-5 text-slate-400" />
              <h1 className="text-2xl font-bold text-slate-900">Committee Report</h1>
            </div>
            <p className="text-sm text-slate-500">Suggestions forwarded to the SGA steering committee.</p>
          </div>
          <button
            onClick={() => exportToCSV(suggestions)}
            disabled={suggestions.length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setStatus(""); setPage(1); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  status === "" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                All
              </button>
              {REPORT_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    status === s ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>

            {isLoading && <p className="text-sm text-slate-400">Loading...</p>}
            {!isLoading && error && (
              <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl border border-red-100">{(error as any).message}</p>
            )}

            {!isLoading && !error && suggestions.length === 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-sm text-slate-400">
                No suggestions have been forwarded to a committee yet.
              </div>
            )}

            {!isLoading && !error && suggestions.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left">
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Title</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Author</th>
                        <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Forwarded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/sims/${s.id}`} className="font-medium text-slate-800 hover:text-blue-600 transition-colors">
                              {s.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3"><CategoryBadges categories={s.categories} /></td>
                          <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                          <td className="px-4 py-3 text-slate-500">
                            {s.employee ? (
                              `${s.employee.firstName} ${s.employee.lastName}`
                            ) : (
                              <span className="inline-flex items-center gap-1 italic text-slate-400">
                                <EyeOff className="h-3 w-3" /> Anonymous
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{formatDate(s.forwardedToCommitteeAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination && pagination.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400">
                      Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                        disabled={page >= pagination.pages}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="xl:col-span-1 space-y-4">
            {isAdmin && <DesignatedCommitteeControl />}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
