"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { Suspense, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { STATUS_LABELS, StatusPill } from "@/components/sims/sims-ui";
import { PageHeader } from "@/components/patterns/PageHeader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  SimsService, Suggestion, SuggestionStatus, SuggestionCategory,
  calcWeight,
} from "@/services/sims.service";
import {
  Download, EyeOff, Lightbulb,
  Filter, Search,
  ChevronRight,
  Star,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const LIST_PAGE_SIZE = 10;

const CATEGORY_CONFIG: Record<SuggestionCategory, { label: string; dot: string; text: string }> = {
  QUALITY:    { label: "Quality",    dot: "bg-info",    text: "text-info"    },
  COST:       { label: "Cost",       dot: "bg-warning",   text: "text-warning"   },
  DELIVERY:   { label: "Delivery",   dot: "bg-success", text: "text-success" },
  SAFETY:     { label: "Safety",     dot: "bg-danger",     text: "text-danger"     },
  MORALE:     { label: "Morale",     dot: "bg-danger",    text: "text-danger"    },
  TECHNOLOGY: { label: "Technology", dot: "bg-primary",  text: "text-primary"  },
  UNKNOWN:    { label: "Unknown",    dot: "bg-muted-foreground",   text: "text-muted-foreground"   },
};

const ALL_STATUSES: SuggestionStatus[] = [
  "WAITING_FOR_REVIEW", "UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA",
  "APPROVED_FOR_IMPLEMENTATION", "IMPLEMENTED", "REJECTED",
];
const ALL_CATEGORIES: SuggestionCategory[] = [
  "QUALITY", "COST", "DELIVERY", "SAFETY", "MORALE", "TECHNOLOGY", "UNKNOWN",
];

// 1 point once a suggestion is approved for implementation, plus 1 more once it's
// actually implemented — 2 points max per suggestion.
function calcSuggestionPoints(status: SuggestionStatus): number {
  let pts = 0;
  if (status === "APPROVED_FOR_IMPLEMENTATION" || status === "IMPLEMENTED") pts += 1;
  if (status === "IMPLEMENTED") pts += 1;
  return pts;
}

function PointsBadge({ status }: { status: SuggestionStatus }) {
  const pts = calcSuggestionPoints(status);
  const isImplemented = status === "IMPLEMENTED";
  const isRejected    = status === "REJECTED";

  if (isRejected || pts === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
        isImplemented
          ? "bg-warning-subtle text-warning"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isImplemented && <Star className="h-2.5 w-2.5 fill-warning stroke-warning" />}
      {pts} {pts === 1 ? "pt" : "pts"}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportToCSV(suggestions: Suggestion[]) {
  const headers = ["Title", "Categories", "Status", "Weight", "Author", "Department", "Date"];
  const rows = suggestions.map((s) => [
    `"${s.title.replace(/"/g, '""')}"`,
    s.categories.join("+"),
    s.status,
    calcWeight(s.categories).toFixed(1),
    s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "Anonymous",
    s.employee?.department?.name ?? "—",
    formatDate(s.createdAt),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "suggestions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function CategoryBadges({ categories, max = 99 }: { categories: SuggestionCategory[]; max?: number }) {
  const visible = categories.slice(0, max);
  const rest = categories.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {visible.map((c) => {
        const cfg = CATEGORY_CONFIG[c];
        return (
          <span key={c} className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
            {cfg.label}
          </span>
        );
      })}
      {rest > 0 && <span className="text-[10px] font-medium text-muted-foreground">+{rest}</span>}
    </div>
  );
}

export default function SimsAllSuggestionsPage() {
  return (
    <Suspense fallback={<div className="py-14 text-center text-sm text-muted-foreground">Loading…</div>}>
      <SimsAllSuggestionsContent />
    </Suspense>
  );
}

function SimsAllSuggestionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, accessToken } = useAuthStore();
  const role = user?.roleLevel;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "">("");
  const [listPage, setListPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const departmentId = searchParams.get("departmentId");

  const { data: allSuggestions = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ["sims-all-browse", role],
    queryFn: () =>
      role === Role.HOD
        ? SimsService.getDepartment(accessToken!, { limit: 500 }).then((r) => r.data)
        : SimsService.getAll(accessToken!, { limit: 500 }).then((r) => r.data),
    enabled: !!accessToken && !!role,
  });

  const error = queryError ? (queryError as Error).message : null;

  const departmentName = useMemo(() => {
    if (!departmentId) return null;
    return allSuggestions.find((s) => s.departmentId === departmentId)?.employee?.department?.name ?? "this department";
  }, [allSuggestions, departmentId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSuggestions.filter((s) => {
      if (departmentId && s.departmentId !== departmentId) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (categoryFilter && !s.categories.includes(categoryFilter as SuggestionCategory)) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSuggestions, departmentId, statusFilter, categoryFilter, search]);

  const listPaginated = useMemo(
    () => filtered.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE),
    [filtered, listPage],
  );
  const totalListPages = Math.ceil(filtered.length / LIST_PAGE_SIZE);

  const pageTitle = role === Role.HOD ? "Department Suggestions" : "All Suggestions";
  const isFiltered = !!statusFilter || !!categoryFilter || !!search.trim() || !!departmentId;

  const clearFilters = () => {
    setListPage(1);
    setStatusFilter("");
    setCategoryFilter("");
    setSearch("");
    if (departmentId) router.push("/sims/all");
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-center sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <PageHeader title={pageTitle} />
            <p className="hidden sm:block text-sm text-muted-foreground mt-1 max-w-xl">
              Browse, search, and filter {role === Role.HOD ? "your department's" : "the organisation's"} full suggestion history.
            </p>
          </div>

          <Button variant="ghost" type="button"
            onClick={() => exportToCSV(filtered)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>

        {/* ── Toolbar: search + filters ────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">

          {/* Search + filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                aria-label="Search suggestions" placeholder="Search suggestions…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setListPage(1); }}
                className="pl-8 pr-3 py-1.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all w-full sm:w-52"
              />
            </div>

            {/* Mobile filter toggle */}
            <Button variant="ghost" type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`sm:hidden flex items-center gap-2 self-start text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                isFiltered ? "border-info/25 bg-info-subtle text-info" : "border-border text-muted-foreground"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
              {isFiltered && <span className="h-1.5 w-1.5 rounded-full bg-info" />}
            </Button>

            {/* Filter selects */}
            <div className={`flex flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}>
              <NativeSelect
                aria-label="Status"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as SuggestionStatus | ""); setListPage(1); }}
                className="text-sm border border-border rounded-xl px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
              >
                <option value="">All Statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Category"
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value as SuggestionCategory | ""); setListPage(1); }}
                className="text-sm border border-border rounded-xl px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
              >
                <option value="">All Categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>
                ))}
              </NativeSelect>
              {isFiltered && (
                <Button variant="ghost" type="button"
                  onClick={clearFilters}
                  className="text-xs text-info hover:text-info font-medium whitespace-nowrap"
                >
                  Clear filters
                </Button>
              )}
            </div>

            {!loading && (
              <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {departmentId && (
          <div className="flex items-center gap-2 -mt-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-info-subtle text-info border border-info/25">
              Department: {departmentName}
              <Button variant="ghost" type="button"
                onClick={() => router.push("/sims/all")}
                className="hover:text-info"
                aria-label="Clear department filter"
              >
                ×
              </Button>
            </span>
          </div>
        )}

        {/* ── Mobile: always card list ──────────────────────────────────────── */}
        <div className="sm:hidden space-y-2">
          {loading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
          {!loading && error && <p className="py-10 text-center text-sm text-danger">{error}</p>}
          {!loading && !error && listPaginated.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
              <Lightbulb className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No suggestions found</p>
            </div>
          )}
          {!loading && !error && listPaginated.map((s) => (
            <Link
              key={s.id}
              href={`/sims/${s.id}`}
              className="block w-full text-left bg-background border border-border hover:border-border hover:shadow-sm rounded-xl p-3.5 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-sm text-foreground leading-snug">{s.title}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <CategoryBadges categories={s.categories} max={3} />
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <StatusPill status={s.status} />
                  <PointsBadge status={s.status} />
                </div>
                <span className="text-[11px] text-muted-foreground">{formatDate(s.createdAt)}</span>
              </div>
              {s.employee && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {s.employee.firstName} {s.employee.lastName}
                  {s.employee.department && (
                    <span className="text-muted-foreground"> · {s.employee.department.name}</span>
                  )}
                </p>
              )}
            </Link>
          ))}
          {!loading && totalListPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <Button variant="ghost" type="button"
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
                disabled={listPage === 1}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors text-muted-foreground"
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground px-2 tabular-nums">{listPage} / {totalListPages}</span>
              <Button variant="ghost" type="button"
                onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                disabled={listPage >= totalListPages}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors text-muted-foreground"
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* ── Desktop: list view ─────────────────────────────────────────────── */}
        <div className="hidden sm:block bg-background border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/80 border-b border-border">
                  <TableRow>
                    <TableHead className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Suggestion</TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Points</TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Submitted by</TableHead>
                    <TableHead className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="px-5 py-14 text-center text-sm text-muted-foreground">
                        Loading suggestions…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && error && (
                    <TableRow>
                      <TableCell colSpan={6} className="px-5 py-14 text-center text-sm text-danger">
                        {error}
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && !error && listPaginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="px-5 py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Lightbulb className="h-7 w-7 text-muted-foreground" />
                          <p className="text-sm font-medium">No suggestions found</p>
                          <p className="text-xs">Try adjusting your filters.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && !error && listPaginated.map((s) => (
                    <TableRow
                      key={s.id}
                      onClick={() => router.push(`/sims/${s.id}`)}
                      className="hover:bg-muted/60 cursor-pointer group transition-colors"
                    >
                      <TableCell className="px-5 py-4">
                        <Link href={`/sims/${s.id}`} onClick={(event) => event.stopPropagation()} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline">{s.title}</Link>
                        <div className="mt-1.5">
                          <CategoryBadges categories={s.categories} />
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 whitespace-nowrap">
                        <StatusPill status={s.status} />
                      </TableCell>
                      <TableCell className="px-5 py-4 whitespace-nowrap">
                        <PointsBadge status={s.status} />
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        {s.employee ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold shrink-0">
                              {s.employee.firstName[0]}{s.employee.lastName[0]}
                            </div>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {s.employee.firstName} {s.employee.lastName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <EyeOff className="h-3.5 w-3.5" />
                            <span className="text-xs italic">Anonymous</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(s.createdAt)}
                      </TableCell>
                      <TableCell className="pr-4 py-4">
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!loading && totalListPages > 1 && (
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {Math.min((listPage - 1) * LIST_PAGE_SIZE + 1, filtered.length)}–
                  {Math.min(listPage * LIST_PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" type="button"
                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                    disabled={listPage === 1}
                    className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-muted-foreground"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground px-2 tabular-nums">{listPage} / {totalListPages}</span>
                  <Button variant="ghost" type="button"
                    onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                    disabled={listPage >= totalListPages}
                    className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-muted-foreground"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

      </div>
    </ProtectedRoute>
  );
}
