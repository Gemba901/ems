"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, SuggestionStatus, SuggestionCategory } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import {
  Lightbulb, ChevronRight, Clock, CheckCircle2,
  XCircle, AlertCircle, Plus,
} from "lucide-react";

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; badge: string; icon: React.ReactNode }> = {
  WAITING_FOR_REVIEW:          { label: "Waiting for Review",         badge: "bg-slate-100 text-slate-600",   icon: <Clock className="h-3.5 w-3.5" /> },
  UNDER_REVIEW:                { label: "Under Review",               badge: "bg-amber-100 text-amber-700",   icon: <Clock className="h-3.5 w-3.5" /> },
  ON_HOLD:                     { label: "On Hold",                    badge: "bg-orange-100 text-orange-700", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  SELECTED_FOR_SGA:            { label: "Selected for SGA",           badge: "bg-indigo-100 text-indigo-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  APPROVED_FOR_IMPLEMENTATION: { label: "Approved for Implementation", badge: "bg-teal-100 text-teal-700",     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  IMPLEMENTED:                 { label: "Implemented",                badge: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  REJECTED:                    { label: "Rejected",                   badge: "bg-red-100 text-red-700",       icon: <XCircle className="h-3.5 w-3.5" /> },
};

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; badge: string }> = {
  QUALITY:    { label: "Quality",    badge: "bg-blue-100 text-blue-700" },
  COST:       { label: "Cost",       badge: "bg-emerald-100 text-emerald-700" },
  DELIVERY:   { label: "Delivery",   badge: "bg-purple-100 text-purple-700" },
  SAFETY:     { label: "Safety",     badge: "bg-red-100 text-red-700" },
  MORALE:     { label: "Morale",     badge: "bg-amber-100 text-amber-700" },
  TECHNOLOGY: { label: "Technology", badge: "bg-indigo-100 text-indigo-700" },
  UNKNOWN:    { label: "Unknown",    badge: "bg-slate-100 text-slate-500" },
};

export default function MySuggestionsPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [filter, setFilter] = useState<SuggestionStatus | "">("");

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: ["sims-my"],
    queryFn: () => SimsService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  const displayed = filter ? suggestions.filter((s) => s.status === filter) : suggestions;

  const counts = {
    total:    suggestions.length,
    active:   suggestions.filter((s) => ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"].includes(s.status)).length,
    approved: suggestions.filter((s) => s.status === "APPROVED_FOR_IMPLEMENTATION").length,
    closed:   suggestions.filter((s) => s.status === "REJECTED").length,
  };

  const successRate = counts.total > 0 ? Math.round((counts.approved / counts.total) * 100) : 0;

  const metrics = [
    {
      label: "Total Submitted",
      value: counts.total,
      icon: <Lightbulb className="h-4 w-4 text-blue-600" />,
      iconBg: "bg-blue-50",
      sub: null,
    },
    {
      label: "In Progress",
      value: counts.active,
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      iconBg: "bg-amber-50",
      sub: counts.active > 0 ? <span className="text-amber-600">Awaiting review</span> : null,
    },
    {
      label: "Approved",
      value: counts.approved,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      iconBg: "bg-emerald-50",
      sub: counts.total > 0 ? <span className="text-emerald-600">{successRate}% approval rate</span> : null,
    },
    {
      label: "Rejected",
      value: counts.closed,
      icon: <XCircle className="h-4 w-4 text-slate-400" />,
      iconBg: "bg-slate-50",
      sub: null,
    },
  ];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="mx-5 pt-4 md:pt-6 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between gap-3 flex-nowrap">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
            My Suggestions
          </h1>
          <Link
            href="/sims/new"
            className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-semibold sm:font-medium text-white shadow-sm hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Suggestion</span>
            <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:order-first" />
          </Link>
        </div>

        {/* Metric cards */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{m.label}</p>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${m.iconBg}`}>{m.icon}</div>
                </div>
                <p className="text-2xl font-bold leading-none text-slate-900">{m.value}</p>
                {m.sub && <p className="text-[11px] mt-1.5">{m.sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0">
          {(["", ...Object.keys(STATUS_CONFIG)] as (SuggestionStatus | "")[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border whitespace-nowrap shrink-0 ${
                filter === s
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {s === "" ? "All" : STATUS_CONFIG[s as SuggestionStatus].label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading && (
          <p className="text-sm text-slate-400 py-10 text-center">Loading your suggestions...</p>
        )}

        {!loading && displayed.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center gap-3 py-20">
            <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
              <Lightbulb className="h-7 w-7 text-blue-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No suggestions here yet</p>
            
            <Link
              href="/sims/new"
              className="mt-1 text-xs font-medium text-blue-600 hover:underline"
            >
              Submit your first idea →
            </Link>
          </div>
        )}

        {!loading && displayed.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="divide-y divide-slate-50">
              {displayed.map((s) => {
                const status = STATUS_CONFIG[s.status];
                const latestReview = s.reviews[s.reviews.length - 1];
                const date = new Date(s.createdAt).toLocaleString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit",
                });
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/sims/${s.id}`)}
                    className="px-4 py-4 sm:px-6 sm:py-5 hover:bg-slate-50/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Badges row */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${status.badge}`}>
                            {status.icon}{status.label}
                          </span>
                          {s.categories.map((c) => {
                            const cfg = CATEGORY_CONFIG[c as SuggestionCategory];
                            return cfg ? (
                              <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.badge}`}>
                                {cfg.label}
                              </span>
                            ) : null;
                          })}
                          {s.isAnonymous && (
                            <span className="text-[10px] text-slate-400 italic">Anonymous</span>
                          )}
                        </div>

                        {/* Title + description */}
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{s.title}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{s.description}</p>

                        {/* Latest review note */}
                        {latestReview?.note && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2">
                            <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[9px] font-bold text-slate-500">
                                {latestReview.reviewer.firstName[0]}{latestReview.reviewer.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-slate-600 italic line-clamp-1">"{latestReview.note}"</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {latestReview.reviewer.firstName} {latestReview.reviewer.lastName}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right meta */}
                      <div className="flex flex-col items-end gap-2 shrink-0 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                        <p className="text-[11px] text-slate-400">{date}</p>
                        <span className="text-[11px] text-slate-400">
                          {s.reviews.length} review{s.reviews.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
