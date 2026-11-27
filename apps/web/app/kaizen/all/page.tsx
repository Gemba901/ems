"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, KaizenStatus } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import { STATUS_LABELS, StatusBadge, Thumbnail, KaizenPagination, formatDate } from "@/components/kaizen/kaizen-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Search, X } from "lucide-react";

const STATUS_FILTERS: (KaizenStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "PENDING_HOD_PRE_REVIEW",
  "RETURNED_FOR_REVISION",
  "REJECTED",
  "MOVED_TO_SGA",
  "IN_IMPLEMENTATION",
  "PENDING_VERIFICATION",
  "RETURNED_FOR_REWORK",
  "VERIFIED_CLOSED",
];

const PAGE_SIZE = 10;

export default function AllKaizensRoute() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT]}>
      <AllKaizensPage />
    </ProtectedRoute>
  );
}

function AllKaizensPage() {
  const { user, accessToken } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<KaizenStatus | "ALL">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: kaizens = [], isLoading, error, refetch } = useQuery({
    queryKey: ["kaizen-all"],
    queryFn: () => KaizenService.getAll(accessToken!),
    enabled: !!accessToken,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.organizationId],
    queryFn: () => EmployeeService.getDepartments(user!.organizationId!, accessToken!),
    enabled: !!accessToken && !!user?.organizationId,
  });

  const filtered = useMemo(() => {
    return kaizens
      .filter((k) => statusFilter === "ALL" || k.status === statusFilter)
      .filter((k) => departmentFilter === "ALL" || k.department?.id === departmentFilter)
      .filter((k) => !search.trim() || (k.title || k.conditionDescription || "").toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [kaizens, statusFilter, departmentFilter, search]);

  const hasFilters = !!search || statusFilter !== "ALL" || departmentFilter !== "ALL";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function clearFilters() {
    setPage(1);
    setSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
  }

  return (
    <div className="space-y-section">
      <PageHeader title="All Kaizens" />
      <div role="search" aria-label="Filter Kaizens" className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-45">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search Kaizens"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search problems..."
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as KaizenStatus | "ALL"); setPage(1); }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All Statuses" : STATUS_LABELS[s]}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Department"
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
        >
          <option value="ALL">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </NativeSelect>
        {hasFilters && (
          <Button type="button" variant="ghost" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>

      {isLoading && <LoadingState label="Loading Kaizens…" />}
      {error && <ErrorState description={error.message} onRetry={() => void refetch()} />}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState title={hasFilters ? "No Kaizens match your filters" : "No Kaizens yet"} />
      )}
      {!isLoading && !error && filtered.length > 0 && (
        <>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {pageItems.map((k) => (
              <Link
                key={k.id}
                href={`/kaizen/${k.id}`}
                className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-muted focus-visible:outline-ring first:rounded-t-xl last:rounded-b-xl transition-colors"
              >
                <Thumbnail src={k.conditionEvidenceUrls[0]} alt={k.title || k.conditionDescription || "Untitled Kaizen"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-card-foreground truncate">{k.title || k.conditionDescription || "Untitled Kaizen"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {k.employee.firstName} {k.employee.lastName} · {k.department?.name ?? "No department"} · {formatDate(k.createdAt)}
                  </p>
                </div>
                <StatusBadge status={k.status} />
              </Link>
            ))}
          </div>
          <KaizenPagination page={currentPage} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
