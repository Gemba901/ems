"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

  const { data: sgas = [], isLoading } = useQuery({
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
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">All SGAs</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-45">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems..."
              className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SgaStatus | "ALL")}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All Statuses" : STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
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

        {isLoading && <p className="text-sm text-slate-400 py-10 text-center">Loading SGAs...</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-xl shadow-sm py-16 text-center">
            <p className="text-sm font-semibold text-slate-600">No SGAs match your filters</p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <>
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm divide-y divide-slate-50">
              {pageItems.map((s) => (
                <Link
                  key={s.id}
                  href={`/sga/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-slate-50 transition-colors"
                >
                  <Thumbnail src={s.beforeFileUrls[0]} alt={s.title || s.problemDescription || "Untitled SGA"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.title || s.problemDescription || "Untitled SGA"}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {s.employee.firstName} {s.employee.lastName} · {s.mainDepartment?.name ?? "No department"} · {formatDate(s.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              ))}
            </div>
            <SgaPagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
