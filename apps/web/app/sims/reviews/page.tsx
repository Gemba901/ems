"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionStatus, SuggestionCategory, calcWeight } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, HelpCircle, ChevronRight, EyeOff, Inbox } from "lucide-react";

const REVIEW_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"];

const SECTION_CONFIG: Record<string, {
  label: string;
  description: string;
  badge: string;
  headerBg: string;
  icon: React.ReactNode;
  accentBar: string;
}> = {
  ON_HOLD: {
    label: "On Hold",
    description: "Paused — awaiting further information or a decision.",
    badge: "bg-orange-100 text-orange-700",
    headerBg: "bg-orange-50 border-orange-100",
    icon: <HelpCircle className="h-4 w-4 text-orange-500" />,
    accentBar: "bg-orange-400",
  },
  SELECTED_FOR_SGA: {
    label: "Selected for SGA",
    description: "Escalated to a Small Group Activity for deeper evaluation.",
    badge: "bg-indigo-100 text-indigo-700",
    headerBg: "bg-indigo-50 border-indigo-100",
    icon: <AlertCircle className="h-4 w-4 text-indigo-500" />,
    accentBar: "bg-indigo-400",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    description: "Suggestions awaiting evaluation and approval.",
    badge: "bg-amber-100 text-amber-700",
    headerBg: "bg-amber-50 border-amber-100",
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    accentBar: "bg-amber-400",
  },
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

function SuggestionCard({ s, accentBar, router }: { s: Suggestion; accentBar: string; router: ReturnType<typeof useRouter> }) {
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
            const catCfg = CATEGORY_CONFIG[c as SuggestionCategory];
            return catCfg ? (
              <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${catCfg.badge}`}>
                {catCfg.label}
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
            <span>{s.reviews.length} prior review{s.reviews.length !== 1 ? "s" : ""}</span></>
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

export default function ReviewsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: ["sims-reviews", role],
    queryFn: async () => {
      const fetch = role === Role.HOD
        ? SimsService.getQueue(accessToken!, { limit: 500 }).then((r) => r.data)
        : SimsService.getAll(accessToken!, { limit: 500 }).then((r) => r.data);
      const data = await fetch;
      return data.filter((s) => REVIEW_STATUSES.includes(s.status));
    },
    enabled: !!accessToken && !!role,
  });

  const grouped = useMemo(() => {
    const onHold: Suggestion[] = [];
    const selectedForSGA: Suggestion[] = [];
    const underReview: Suggestion[] = [];

    suggestions.forEach((s) => {
      if (s.status === "ON_HOLD") {
        onHold.push(s);
      } else if (s.status === "SELECTED_FOR_SGA") {
        selectedForSGA.push(s);
      } else {
        underReview.push(s);
      }
    });

    return { ON_HOLD: onHold, SELECTED_FOR_SGA: selectedForSGA, UNDER_REVIEW: underReview };
  }, [suggestions]);

  const totalPending = suggestions.length;
  const urgentCount = grouped.ON_HOLD.length;

  const visibleSections = ["ON_HOLD", "SELECTED_FOR_SGA", "UNDER_REVIEW"] as (keyof typeof grouped)[];

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
                : `${totalPending} suggestion${totalPending !== 1 ? "s" : ""} awaiting action`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {!loading && urgentCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm">
                <HelpCircle className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="text-orange-700 font-medium">{urgentCount} on hold</span>
              </div>
            )}
          </div>
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

        {!loading && visibleSections.map((status) => {
          const group = grouped[status];
          if (!group || group.length === 0) return null;
          const cfg = SECTION_CONFIG[status];

          return (
            <div key={status} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
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

              <div className="divide-y divide-slate-50">
                {group.map((s) => (
                  <SuggestionCard key={s.id} s={s} accentBar={cfg.accentBar} router={router} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ProtectedRoute>
  );
}
