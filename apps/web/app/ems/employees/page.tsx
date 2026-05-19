"use client";

import { useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeWithCompletion, EmploymentStatus, EMPLOYMENT_STATUS_LABELS,
  completionColor, completionBg,
} from "@/services/ems.service";
import { Search, ChevronLeft, ChevronRight, Loader2, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

function CompletionPill({ pct }: { pct: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
      pct >= 97 ? "bg-emerald-100 text-emerald-700" :
      pct >= 90 ? "bg-blue-100 text-blue-700" :
      pct >= 75 ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
    }`}>
      {pct}%
    </span>
  );
}

export default function EmsEmployeesPage() {
  const { accessToken } = useAuthStore();
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<EmploymentStatus | "">("");

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["ems-employees", page, statusFilter],
    queryFn: () => EmsService.getEmployees(accessToken!, {
      page,
      limit: PAGE_SIZE,
      employmentStatus: statusFilter || undefined,
    }),
    enabled: !!accessToken,
  });

  const employees: EmployeeWithCompletion[] = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const pages = data?.pagination.pages ?? 1;
  const error = queryError ? (queryError as any).message : null;

  const filtered = search.trim()
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName} ${e.employeeCode ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
    : employees;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="max-w-7xl mx-auto space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/ems" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
            <p className="text-sm text-slate-500">Profile completeness for all employees</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as EmploymentStatus | ""); setPage(1); }}
            className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
          >
            <option value="">All statuses</option>
            {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [EmploymentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="px-5 py-4 text-sm text-red-600">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Department</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Completion</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-slate-400">{emp.employeeCode ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {emp.firstName} {emp.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{emp.department?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          emp.employmentStatus === "ACTIVE"    ? "bg-emerald-100 text-emerald-700" :
                          emp.employmentStatus === "PROBATION" ? "bg-blue-100 text-blue-700" :
                                                                 "bg-slate-100 text-slate-500"
                        }`}>
                          {EMPLOYMENT_STATUS_LABELS[emp.employmentStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${completionBg(emp.completion.overall)}`}
                              style={{ width: `${emp.completion.overall}%` }}
                            />
                          </div>
                          <CompletionPill pct={emp.completion.overall} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/ems/employees/${emp.id}`}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                        No employees found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
              <p>{total} employees</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs">{page} / {pages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
