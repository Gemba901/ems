"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useState } from "react";
import Link from "next/link";
import { STATUS_LABELS, StatusPill } from "@/components/sims/sims-ui";
import { PageHeader } from "@/components/patterns/PageHeader";
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
  QUALITY:    { label: "Quality",    dot: "bg-info",    text: "text-info"    },
  COST:       { label: "Cost",       dot: "bg-warning",   text: "text-warning"   },
  DELIVERY:   { label: "Delivery",   dot: "bg-success", text: "text-success" },
  SAFETY:     { label: "Safety",     dot: "bg-danger",     text: "text-danger"     },
  MORALE:     { label: "Morale",     dot: "bg-danger",    text: "text-danger"    },
  TECHNOLOGY: { label: "Technology", dot: "bg-primary",  text: "text-primary"  },
  UNKNOWN:    { label: "Unknown",    dot: "bg-muted-foreground",   text: "text-muted-foreground"   },
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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Unable to update the committee."),
  });

  return (
    <div className="bg-background border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-bold text-foreground">Designated SGA Committee</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Suggestions an HOD marks “Selected for SGA” are automatically forwarded to this committee.
      </p>
      <NativeSelect
        value={designated?.id ?? ""}
        onChange={(e) => e.target.value && setDesignatedMutation.mutate(e.target.value)}
        disabled={setDesignatedMutation.isPending}
        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary"
      >
        <option value="" disabled>Select a committee...</option>
        {committees.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </NativeSelect>
      {error && (
        <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2 mt-3">{error}</p>
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
      <div>

        <div className="flex items-center sm:items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Users className="hidden sm:block h-5 w-5 text-muted-foreground" />
              <PageHeader title="Committee Report" />
            </div>
            <p className="hidden sm:block text-sm text-muted-foreground">Suggestions forwarded to the SGA steering committee.</p>
          </div>
          <Button variant="ghost" type="button"
            onClick={() => exportToCSV(suggestions)}
            disabled={suggestions.length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" type="button"
                onClick={() => { setStatus(""); setPage(1); }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  status === "" ? "bg-primary text-primary-foreground border-border" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                All
              </Button>
              {REPORT_STATUSES.map((s) => (
                <Button variant="ghost" type="button"
                  key={s}
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    status === s ? "bg-primary text-primary-foreground border-border" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!isLoading && error && (
              <p className="text-sm text-danger bg-danger-subtle px-4 py-3 rounded-xl border border-danger/25">{error.message}</p>
            )}

            {!isLoading && !error && suggestions.length === 0 && (
              <div className="bg-background border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
                No suggestions have been forwarded to a committee yet.
              </div>
            )}

            {!isLoading && !error && suggestions.length > 0 && (
              <div className="bg-background border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow className="border-b border-border text-left">
                        <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Title</TableHead>
                        <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Category</TableHead>
                        <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                        <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Author</TableHead>
                        <TableHead className="px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Forwarded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map((s) => (
                        <TableRow key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <TableCell className="px-4 py-3">
                            <Link href={`/sims/${s.id}`} className="font-medium text-foreground hover:text-info transition-colors">
                              {s.title}
                            </Link>
                          </TableCell>
                          <TableCell className="px-4 py-3"><CategoryBadges categories={s.categories} /></TableCell>
                          <TableCell className="px-4 py-3"><StatusPill status={s.status} /></TableCell>
                          <TableCell className="px-4 py-3 text-muted-foreground">
                            {s.employee ? (
                              `${s.employee.firstName} ${s.employee.lastName}`
                            ) : (
                              <span className="inline-flex items-center gap-1 italic text-muted-foreground">
                                <EyeOff className="h-3 w-3" /> Anonymous
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-muted-foreground">{formatDate(s.forwardedToCommitteeAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {pagination && pagination.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" type="button"
                        onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                        disabled={page >= pagination.pages}
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
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
