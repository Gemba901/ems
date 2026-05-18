"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus, calcWeight } from "@/services/sims.service";
import { ChevronRight, EyeOff, Clock, AlertCircle, HelpCircle } from "lucide-react";

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  QUALITY:    "bg-blue-100 text-blue-700",
  COST:       "bg-emerald-100 text-emerald-700",
  DELIVERY:   "bg-purple-100 text-purple-700",
  SAFETY:     "bg-red-100 text-red-700",
  MORALE:     "bg-amber-100 text-amber-700",
  TECHNOLOGY: "bg-indigo-100 text-indigo-700",
  UNKNOWN:    "bg-slate-100 text-slate-500",
};

function QueueCard({ s, accentBar, router }: { s: Suggestion; accentBar: string; router: ReturnType<typeof useRouter> }) {
  const daysSince = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
  return (
    <div
      onClick={() => router.push(`/sims/${s.id}`)}
      className="flex items-center gap-3 px-4 py-4 sm:px-6 hover:bg-slate-50/70 cursor-pointer transition-colors group"
    >
      <div className={`w-1 self-stretch rounded-full shrink-0 ${accentBar}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
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
        </div>

        <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>

        <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
          {s.employee ? (
            <div className="flex items-center gap-1.5">
              <div className="h-4 w-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                {s.employee.firstName[0]}{s.employee.lastName[0]}
              </div>
              <span>{s.employee.firstName} {s.employee.lastName}</span>
              {s.employee.department?.name && (
                <><span className="text-slate-300">·</span><span>{s.employee.department.name}</span></>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Anonymous</span>
          )}
          <span className="text-slate-300">·</span>
          <span>{daysSince === 0 ? "Today" : `${daysSince}d ago`}</span>
          {s.reviews.length > 0 && (
            <><span className="text-slate-300">·</span>
            <span>{s.reviews.length} review{s.reviews.length !== 1 ? "s" : ""}</span></>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/sims/${s.id}`); }}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
        >
          Review
        </button>
        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors hidden sm:block" />
      </div>
    </div>
  );
}

const ADMIN_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT] as const;

export default function QueuePage() {
  const router = useRouter();
  const { accessToken, user } = useAuthStore();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const isHOD = user?.roleLevel === Role.HOD;

  useEffect(() => {
    if (!accessToken || !user?.roleLevel) return;

    const ACTIVE_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"];

    const fetch = ADMIN_ROLES.includes(user.roleLevel as typeof ADMIN_ROLES[number])
      ? SimsService.getAll(accessToken, { limit: 500 }).then((r) => r.data)
      : SimsService.getQueue(accessToken, { limit: 500 }).then((r) => r.data);

    fetch
      .then((data) => setSuggestions(data.filter((s) => ACTIVE_STATUSES.includes(s.status))))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [accessToken, user?.roleLevel]);

  const underReview = suggestions.filter((s) => s.status === "UNDER_REVIEW");
  const onHold = suggestions.filter((s) => s.status === "ON_HOLD");
  const selectedForSGA = suggestions.filter((s) => s.status === "SELECTED_FOR_SGA");

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isHOD ? "Department Review Queue" : "Review Queue"}</h1>
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
            <div className="flex items-center gap-2.5 px-6 py-4 border-b bg-amber-50 border-amber-100">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Ready for Review</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{underReview.length}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Awaiting decision or feedback.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {underReview.map((s) => (
                <QueueCard key={s.id} s={s} accentBar="bg-amber-400" router={router} />
              ))}
            </div>
          </div>
        )}

        {/* On Hold section */}
        {!loading && onHold.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b bg-orange-50 border-orange-100">
              <HelpCircle className="h-4 w-4 text-orange-500" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">On Hold</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{onHold.length}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Paused — awaiting further information or a decision.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {onHold.map((s) => (
                <QueueCard key={s.id} s={s} accentBar="bg-orange-400" router={router} />
              ))}
            </div>
          </div>
        )}

        {/* Selected for SGA section */}
        {!loading && selectedForSGA.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b bg-indigo-50 border-indigo-100">
              <AlertCircle className="h-4 w-4 text-indigo-500" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Selected for SGA</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{selectedForSGA.length}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Escalated to a Small Group Activity for deeper evaluation.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {selectedForSGA.map((s) => (
                <QueueCard key={s.id} s={s} accentBar="bg-indigo-400" router={router} />
              ))}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
