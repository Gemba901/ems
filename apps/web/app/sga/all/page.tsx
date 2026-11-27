"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/patterns/PageHeader";
import { LoadingState } from "@/components/patterns/LoadingState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SgaService, SgaStatus } from "@/services/sga.service";
import { EmployeeService } from "@/services/employee.service";
import { STATUS_LABELS, StatusBadge, Thumbnail, SgaPagination, formatDate } from "@/components/sga/sga-ui";
import { Search, X } from "lucide-react";

const STATUS_FILTERS: (SgaStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "PENDING_HOD_APPROVAL",
  "RETURNED_FOR_REVISION",
  "REJECTED",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
];

const PAGE_SIZE = 10;

export default function AllSgasPage() {
  const { user, accessToken } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<SgaStatus | "ALL">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: sgas = [], isLoading, error, refetch } = useQuery({
    queryKey: ["sga-all"],
    queryFn: () => SgaService.getAll(accessToken!),
    enabled: !!accessToken,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.organizationId],
    queryFn: () => EmployeeService.getDepartments(user!.organizationId!, accessToken!),
    enabled: !!accessToken && !!user?.organizationId,
  });

  const filtered = useMemo(() => {
    return sgas
      .filter((s) => statusFilter === "ALL" || s.status === statusFilter)
      .filter((s) => departmentFilter === "ALL" || s.mainDepartment?.id === departmentFilter)
      .filter((s) => !search.trim() || (s.title || s.problemDescription || "").toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sgas, statusFilter, departmentFilter, search]);

  const hasFilters = !!search || statusFilter !== "ALL" || departmentFilter !== "ALL";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const clearFilters = () => {
    setPage(1);
    setSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT]}>
      <div className="space-y-6">
        <PageHeader title="All SGAs" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-45">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search" aria-label="Search SGAs"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search problems..."
              className="w-full border border-border rounded-lg pl-8 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all"
            />
          </div>
          <NativeSelect
            aria-label="SGA status" value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as SgaStatus | "ALL"); setPage(1); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All Statuses" : STATUS_LABELS[s]}</option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Department" value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition-all"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </NativeSelect>
          {hasFilters && (
            <Button variant="ghost" type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-2"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </Button>
          )}
        </div>

        {isLoading && <LoadingState label="Loading SGAs…" />}
        {error && <ErrorState description={error.message} onRetry={() => void refetch()} />}
        {!isLoading && !error && filtered.length === 0 && <EmptyState title={hasFilters ? "No SGAs match your filters" : "No SGAs yet"} />}

        {!isLoading && !error && filtered.length > 0 && (
          <>
            <div className="bg-background border border-border rounded-xl shadow-sm divide-y divide-border">
              {pageItems.map((s) => (
                <Link
                  key={s.id}
                  href={`/sga/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-muted transition-colors"
                >
                  <Thumbnail src={s.beforeFileUrls[0]} alt={s.title || s.problemDescription || "Untitled SGA"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{s.title || s.problemDescription || "Untitled SGA"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.employee.firstName} {s.employee.lastName} · {s.mainDepartment?.name ?? "No department"} · {formatDate(s.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </div>
            <SgaPagination page={currentPage} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
