"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, KaizenStatus } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import { STATUS_LABELS, StatusBadge, Thumbnail, KaizenPagination, formatDate } from "@/components/kaizen/kaizen-ui";
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

export default function AllKaizensPage() {
  const { user, accessToken } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<KaizenStatus | "ALL">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: kaizens = [], isLoading } = useQuery({
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
      .filter((k) => !search.trim() || (k.title || k.conditionDescription).toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [kaizens, statusFilter, departmentFilter, search]);

  const hasFilters = !!search || statusFilter !== "ALL" || departmentFilter !== "ALL";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, departmentFilter, search]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT]}>
      <div className="mx-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">All Kaizens</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-45">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems..."
              className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as KaizenStatus | "ALL")}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All Statuses" : STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-2"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </button>
          )}
        </div>

        {isLoading && <p className="text-sm text-slate-400 py-10 text-center">Loading kaizens...</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm py-16 text-center">
            <p className="text-sm font-semibold text-slate-600">No kaizens match your filters</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <>
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm divide-y divide-slate-50">
              {pageItems.map((k) => (
                <Link
                  key={k.id}
                  href={`/kaizen/${k.id}`}
                  className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-slate-50 transition-colors"
                >
                  <Thumbnail src={k.conditionEvidenceUrls[0]} alt={k.title || k.conditionDescription} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{k.title || k.conditionDescription}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {k.employee.firstName} {k.employee.lastName} · {k.department?.name ?? "No department"} · {formatDate(k.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={k.status} />
                </Link>
              ))}
            </div>
            <KaizenPagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
