"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus, calcWeight } from "@/services/sims.service";
import { ChevronRight, EyeOff, Users, Clock, AlertCircle, HelpCircle, Inbox } from "lucide-react";

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  QUALITY:    "bg-blue-100 text-blue-700",
  COST:       "bg-emerald-100 text-emerald-700",
  DELIVERY:   "bg-purple-100 text-purple-700",
  SAFETY:     "bg-red-100 text-red-700",
  MORALE:     "bg-amber-100 text-amber-700",
  TECHNOLOGY: "bg-indigo-100 text-indigo-700",
  UNKNOWN:    "bg-slate-100 text-slate-500",
};

const STATUS_CONFIG: Record<string, { label: string; badge: string; icon: React.ReactNode; accentBar: string }> = {
  UNDER_REVIEW: {
    label: "Ready for Review",
    badge: "bg-amber-100 text-amber-700",
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    accentBar: "bg-amber-400",
  },
  NEEDS_CLARIFICATION: {
    label: "Needs Clarification",
    badge: "bg-orange-100 text-orange-700",
    icon: <HelpCircle className="h-4 w-4 text-orange-500" />,
    accentBar: "bg-orange-400",
  },
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

export default function QueuePage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    SimsService.getQueue(accessToken, { limit: 500 })
      .then((r) => {
        const active = r.data.filter((s) =>
          (["UNDER_REVIEW", "NEEDS_CLARIFICATION"] as SuggestionStatus[]).includes(s.status)
        );
        setSuggestions(active);
      })
      .catch((err: Error) => {
        if (err.message?.toLowerCase().includes("not a member")) setNotMember(true);
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  const underReview = suggestions.filter((s) => s.status === "UNDER_REVIEW");
  const needsClarification = suggestions.filter((s) => s.status === "NEEDS_CLARIFICATION");

  const committeeNames = [...new Set(suggestions.map((s) => s.committee?.name).filter(Boolean))];

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Committee Queue</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading
                ? "Loading..."
                : notMember
                  ? "You are not assigned to any steering committee"
                  : `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} awaiting your committee's review`}
            </p>
          </div>

          {!loading && !notMember && committeeNames.length > 0 && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {committeeNames.map((name) => (
                <div key={name} className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-sm">
                  <Users className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-blue-700 font-medium">{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <p className="text-slate-400 text-sm py-10 text-center">Loading your committee queue...</p>
        )}

        {/* Not a committee member */}
        {!loading && notMember && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center gap-3 py-20">
            <div className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center">
              <Users className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Not a committee member</p>
            <p className="text-xs text-slate-400">You have not been assigned to any steering committee yet.</p>
          </div>
        )}

        {/* All caught up */}
        {!loading && !notMember && suggestions.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center gap-3 py-20">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <Clock className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Queue is clear!</p>
            <p className="text-xs text-slate-400">No suggestions are currently waiting for your committee's review.</p>
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
                <p className="text-xs text-slate-500 mt-0.5">Awaiting your committee's decision at the next meeting.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {underReview.map((s) => (
                <QueueCard key={s.id} s={s} accentBar="bg-amber-400" router={router} />
              ))}
            </div>
          </div>
        )}

        {/* Needs Clarification section */}
        {!loading && needsClarification.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b bg-orange-50 border-orange-100">
              <HelpCircle className="h-4 w-4 text-orange-500" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Needs Clarification</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{needsClarification.length}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Waiting for the employee to respond before review can continue.</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {needsClarification.map((s) => (
                <QueueCard key={s.id} s={s} accentBar="bg-orange-400" router={router} />
              ))}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
