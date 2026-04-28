"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionStatus, SuggestionCategory } from "@/services/sims.service";
import { AlertCircle, Clock, HelpCircle, ChevronRight, EyeOff } from "lucide-react";

const REVIEW_STATUSES: SuggestionStatus[] = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_CLARIFICATION"];

const SECTION_CONFIG: Record<string, {
  label: string;
  description: string;
  badge: string;
  headerBg: string;
  icon: React.ReactNode;
  accentBar: string;
}> = {
  NEEDS_CLARIFICATION: {
    label: "Needs Clarification",
    description: "Employee response required before review can continue.",
    badge: "bg-orange-100 text-orange-700",
    headerBg: "bg-orange-50 border-orange-100",
    icon: <HelpCircle className="h-4 w-4 text-orange-500" />,
    accentBar: "bg-orange-400",
  },
  SUBMITTED: {
    label: "New Submissions",
    description: "Freshly submitted — awaiting first review.",
    badge: "bg-blue-100 text-blue-700",
    headerBg: "bg-blue-50 border-blue-100",
    icon: <Clock className="h-4 w-4 text-blue-500" />,
    accentBar: "bg-blue-400",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    description: "Already in progress — complete or escalate.",
    badge: "bg-amber-100 text-amber-700",
    headerBg: "bg-amber-50 border-amber-100",
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    accentBar: "bg-amber-400",
  },
};

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  QUALITY:    "bg-blue-100 text-blue-700",
  COST:       "bg-emerald-100 text-emerald-700",
  DELIVERY:   "bg-purple-100 text-purple-700",
  SAFETY:     "bg-red-100 text-red-700",
  MORALE:     "bg-amber-100 text-amber-700",
  TECHNOLOGY: "bg-indigo-100 text-indigo-700",
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-slate-300", MEDIUM: "bg-blue-400", HIGH: "bg-amber-400", CRITICAL: "bg-red-500",
};

export default function ReviewsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !role) return;
    const fetch = role === Role.HOD
      ? SimsService.getDepartment(accessToken, { limit: 500 }).then((r) => r.data)
      : SimsService.getAll(accessToken, { limit: 500 }).then((r) => r.data);
    fetch
      .then((data) => setSuggestions(data.filter((s) => REVIEW_STATUSES.includes(s.status))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accessToken, role]);

  const grouped = useMemo(() => {
    const groups: Record<string, Suggestion[]> = {
      NEEDS_CLARIFICATION: [], SUBMITTED: [], UNDER_REVIEW: [],
    };
    suggestions.forEach((s) => { groups[s.status]?.push(s); });
    return groups;
  }, [suggestions]);

  const totalPending = suggestions.length;
  const urgentCount = grouped.NEEDS_CLARIFICATION?.length ?? 0;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reviews Queue</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loading
                ? "Loading..."
                : `${totalPending} suggestion${totalPending !== 1 ? "s" : ""} awaiting action.`}
            </p>
          </div>

          {/* Urgent banner */}
          {!loading && urgentCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm shrink-0">
              <HelpCircle className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="text-orange-700 font-medium">{urgentCount} blocked — need clarification</span>
            </div>
          )}
        </div>

        {loading && (
          <p className="text-slate-400 text-sm py-10 text-center">Loading review queue...</p>
        )}

        {!loading && totalPending === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center gap-3 py-20">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <Clock className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">All caught up!</p>
            <p className="text-xs text-slate-400">No suggestions are currently waiting for review.</p>
          </div>
        )}

        {!loading && REVIEW_STATUSES.map((status) => {
          const group = grouped[status];
          if (!group || group.length === 0) return null;
          const cfg = SECTION_CONFIG[status];

          return (
            <div key={status} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              {/* Section header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${cfg.headerBg}`}>
                <div className="flex items-center gap-2.5">
                  {cfg.icon}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-800">{cfg.label}</h2>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {group.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{cfg.description}</p>
                  </div>
                </div>
              </div>

              {/* Cards */}
              <div className="divide-y divide-slate-50">
                {group.map((s) => {
                  const catBadge = CATEGORY_BADGE[s.category];
                  const daysSince = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
                  return (
                    <div
                      key={s.id}
                      onClick={() => router.push(`/sims/${s.id}`)}
                      className="flex items-center gap-3 px-4 py-4 sm:px-6 hover:bg-slate-50/70 cursor-pointer transition-colors group"
                    >
                      {/* Accent bar */}
                      <div className={`w-1 self-stretch rounded-full shrink-0 ${cfg.accentBar}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${catBadge}`}>
                            {s.category.charAt(0) + s.category.slice(1).toLowerCase()}
                          </span>
                          {s.priority && (
                            <span className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[s.priority]}`} />
                              <span className="text-xs text-slate-500 capitalize">{s.priority.toLowerCase()} priority</span>
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
                                <span className="text-slate-300">·</span>
                              )}
                              {s.employee.department?.name && (
                                <span>{s.employee.department.name}</span>
                              )}
                            </div>
                          ) : (
                            <span className="flex items-center gap-1">
                              <EyeOff className="h-3 w-3" /> Anonymous
                            </span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span>{daysSince === 0 ? "Today" : `${daysSince}d ago`}</span>
                          {s.reviews.length > 0 && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span>{s.reviews.length} prior review{s.reviews.length !== 1 ? "s" : ""}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
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
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ProtectedRoute>
  );
}
