"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/sims/sims-ui";
import { PageHeader } from "@/components/patterns/PageHeader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, EyeOff, ChevronRight, Search, X } from "lucide-react";

const RESOLVED_STATUSES: SuggestionStatus[] = ["APPROVED_FOR_IMPLEMENTATION", "IMPLEMENTED", "REJECTED"];

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; badge: string }> = {
  QUALITY:    { label: "Quality",    badge: "bg-info-subtle text-info" },
  COST:       { label: "Cost",       badge: "bg-success-subtle text-success" },
  DELIVERY:   { label: "Delivery",   badge: "bg-accent text-primary" },
  SAFETY:     { label: "Safety",     badge: "bg-danger-subtle text-danger" },
  MORALE:     { label: "Morale",     badge: "bg-warning-subtle text-warning" },
  TECHNOLOGY: { label: "Technology", badge: "bg-accent text-primary" },
  UNKNOWN:    { label: "Unknown",    badge: "bg-muted text-muted-foreground" },
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
      <div className="space-y-6">

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <PageHeader title="Closed Suggestions" />
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Loading..." : `${suggestions.length} resolved suggestion${suggestions.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search archived..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary bg-background"
            />
            {search && (
              <Button variant="ghost" type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-muted-foreground" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" type="button"
              onClick={() => setCategoryFilter("")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${categoryFilter === "" ? "bg-primary text-primary-foreground border-border" : "bg-background text-muted-foreground border-border hover:border-border"}`}
            >
              All Categories
            </Button>
            {ALL_CATEGORIES.map((cat) => (
              <Button variant="ghost" type="button"
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? "" : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${categoryFilter === cat ? "bg-primary text-primary-foreground border-border" : "bg-background text-muted-foreground border-border hover:border-border"}`}
              >
                {CATEGORY_CONFIG[cat].label}
              </Button>
            ))}
          </div>
        </div>

        {loading && <p className="text-muted-foreground text-sm py-12 text-center">Loading closed suggestions...</p>}

        {!loading && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">No closed suggestions found</p>
            {(search || categoryFilter) && (
              <Button variant="ghost" type="button" onClick={() => { setSearch(""); setCategoryFilter(""); }} className="text-xs text-info hover:underline">
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!loading && displayed.length > 0 && (search || categoryFilter) && (
          <p className="text-xs text-muted-foreground">{displayed.length} of {suggestions.length} results</p>
        )}

        <div className="space-y-2">
          {!loading && displayed.map((s) => {
            const lastReview = [...s.reviews].reverse()[0];
            const dt = new Date(s.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            return (
              <div
                key={s.id}
                onClick={() => router.push(`/sims/${s.id}`)}
                className="bg-background border border-border rounded-xl p-5 hover:shadow-md cursor-pointer transition-all group flex items-center justify-between gap-4 opacity-80 hover:opacity-100"
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
                    <StatusPill status={s.status} />
                  </div>
                  <p className="text-sm font-bold text-foreground truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    {s.employee ? (
                      <span>{s.employee.firstName} {s.employee.lastName} · {s.employee.department?.name ?? "—"}</span>
                    ) : (
                      <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Anonymous</span>
                    )}
                    <span>· {dt}</span>
                    {lastReview?.note && (
                      <span className="italic truncate max-w-65">· “{lastReview.note}”</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-info transition-colors shrink-0" />
              </div>
            );
          })}
        </div>

      </div>
    </ProtectedRoute>
  );
}
