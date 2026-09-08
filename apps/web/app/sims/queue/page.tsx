"use client";

import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus, calcWeight } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  QUALITY:    "bg-blue-100 text-blue-700",
  COST:       "bg-emerald-100 text-emerald-700",
  DELIVERY:   "bg-purple-100 text-purple-700",
  SAFETY:     "bg-red-100 text-red-700",
  MORALE:     "bg-amber-100 text-amber-700",
  TECHNOLOGY: "bg-indigo-100 text-indigo-700",
  UNKNOWN:    "bg-slate-100 text-slate-500",
};

function QueueCard({ s, router }: { s: Suggestion; router: ReturnType<typeof useRouter> }) {
  const daysSince = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
  return (
    <div
      onClick={() => router.push(`/sims/${s.id}`)}
      className="px-4 py-4 sm:px-6 sm:py-5 hover:bg-slate-50/70 cursor-pointer transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {s.categories.map((c) => {
              const badge = CATEGORY_BADGE[c as SuggestionCategory];
              return badge ? (
                <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badge}`}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </span>
              ) : null;
            })}
            {calcWeight(s.categories) > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-100">
                W {calcWeight(s.categories).toFixed(1)}
              </span>
            )}
            {s.isAnonymous && (
              <span className="text-[10px] text-slate-400 italic">Anonymous</span>
            )}
          </div>

          {/* Title + description */}
          <p className="text-sm font-semibold text-slate-900 leading-snug">{s.title}</p>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{s.description}</p>

          {/* Submitter */}
          {s.employee && (
            <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-400 flex-wrap">
              <span className="font-medium text-slate-500">{s.employee.firstName} {s.employee.lastName}</span>
              {s.employee.department?.name && (
                <><span className="text-slate-300">·</span><span>{s.employee.department.name}</span></>
              )}
            </div>
          )}
        </div>

        {/* Right meta + action */}
        <div className="flex flex-col items-end gap-2 shrink-0 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/sims/${s.id}`); }}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Review
          </button>
          <p className="text-[11px] text-slate-400">{daysSince === 0 ? "Today" : `${daysSince}d ago`}</p>
          <span className="text-[11px] text-slate-400">
            {s.reviews.length} review{s.reviews.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

const ACTIVE_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"];

export default function QueuePage() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: ["sims-queue", user?.roleLevel],
    queryFn: async () => {
      const data = await SimsService.getQueue(accessToken!, { limit: 500 }).then((r) => r.data);
      return data.filter((s) => ACTIVE_STATUSES.includes(s.status));
    },
    enabled: !!accessToken && !!user?.roleLevel,
  });

  const underReview = suggestions.filter((s) => s.status === "UNDER_REVIEW");
  const onHold = suggestions.filter((s) => s.status === "ON_HOLD");
  const selectedForSGA = suggestions.filter((s) => s.status === "SELECTED_FOR_SGA");

  return (
    <ProtectedRoute allowedRoles={[Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Department Review Queue</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading
                ? "Loading..."
                : `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} awaiting your review`}
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-slate-400 text-sm py-10 text-center">Loading your review queue...</p>
        )}

        {/* All caught up */}
        {!loading && suggestions.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center gap-3 py-20">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <Clock className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Queue is clear!</p>
            <p className="text-xs text-slate-400">No suggestions are currently waiting for your review.</p>
          </div>
        )}

        {/* Under Review section */}
        {!loading && underReview.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ready for Review</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{underReview.length}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {underReview.map((s) => (
                <QueueCard key={s.id} s={s} router={router} />
              ))}
            </div>
          </div>
        )}

        {/* On Hold section */}
        {!loading && onHold.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">On Hold</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{onHold.length}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {onHold.map((s) => (
                <QueueCard key={s.id} s={s} router={router} />
              ))}
            </div>
          </div>
        )}

        {/* Selected for SGA section */}
        {!loading && selectedForSGA.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Selected for SGA</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{selectedForSGA.length}</span>
            </div>
            <div className="divide-y divide-slate-50">
              {selectedForSGA.map((s) => (
                <QueueCard key={s.id} s={s} router={router} />
              ))}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
