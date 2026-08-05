"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, EyeOff, ChevronRight, Search, X } from "lucide-react";

const RESOLVED_STATUSES: SuggestionStatus[] = ["APPROVED_FOR_IMPLEMENTATION", "REJECTED"];

const STATUS_BADGE: Record<string, string> = {
  APPROVED_FOR_IMPLEMENTATION: "bg-emerald-100 text-emerald-700",
  REJECTED:                    "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  APPROVED_FOR_IMPLEMENTATION: "Approved for Implementation",
  REJECTED:                    "Rejected",
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

const ALL_CATEGORIES: SuggestionCategory[] = ["QUALITY","COST","DELIVERY","SAFETY","MORALE","TECHNOLOGY","UNKNOWN"];

export default function ArchivedPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: ["sims-archived", role],
    queryFn: async () => {
      const fetchAll = (status: SuggestionStatus) => role === Role.HOD
        ? SimsService.getDepartment(accessToken!, { status, limit: 500 }).then((r) => r.data)
        : SimsService.getAll(accessToken!, { status, limit: 500 }).then((r) => r.data);
      const results = await Promise.all(RESOLVED_STATUSES.map(fetchAll));
      return results.flat();
    },
    enabled: !!accessToken && !!role,
  });

  const displayed = suggestions.filter((s) => {
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || s.categories.includes(categoryFilter as SuggestionCategory);
    return matchSearch && matchCat;
  });

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="px-4 py-4 md:px-8 md:py-6 space-y-6">

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Closed Suggestions</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {loading ? "Loading..." : `${suggestions.length} resolved suggestion${suggestions.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search archived..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter("")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${categoryFilter === "" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
            >
              All Categories
            </button>
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${categoryFilter === cat ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
              >
                {CATEGORY_CONFIG[cat].label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-slate-400 text-sm py-12 text-center">Loading closed suggestions...</p>}

        {!loading && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
            <div className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">No closed suggestions found</p>
            {(search || categoryFilter) && (
              <button onClick={() => { setSearch(""); setCategoryFilter(""); }} className="text-xs text-blue-600 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && displayed.length > 0 && (search || categoryFilter) && (
          <p className="text-xs text-slate-400">{displayed.length} of {suggestions.length} results</p>
        )}

        <div className="space-y-2">
          {!loading && displayed.map((s) => {
            const lastReview = [...s.reviews].reverse()[0];
            const dt = new Date(s.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            return (
              <div
                key={s.id}
                onClick={() => router.push(`/sims/${s.id}`)}
                className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md cursor-pointer transition-all group flex items-center justify-between gap-4 opacity-80 hover:opacity-100"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {s.categories.map((c) => {
                      const cfg = CATEGORY_CONFIG[c as SuggestionCategory];
                      return cfg ? (
                        <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      ) : null;
                    })}
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-400"}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-700 truncate">{s.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{s.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-400">
                    {s.employee ? (
                      <span>{s.employee.firstName} {s.employee.lastName} · {s.employee.department?.name ?? "—"}</span>
                    ) : (
                      <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Anonymous</span>
                    )}
                    <span>· {dt}</span>
                    {lastReview?.note && (
                      <span className="italic truncate max-w-65">· "{lastReview.note}"</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" />
              </div>
            );
          })}
        </div>

      </div>
    </ProtectedRoute>
  );
}
