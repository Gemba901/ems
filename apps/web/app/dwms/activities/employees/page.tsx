"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, Loader2, Search, UserRound } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsActivityEmployee,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import EmployeeActivityManager from "../../components/EmployeeActivityManager";
import ActivityTabs from "../ActivityTabs";

const PAGE_SIZE = 15;
const ALLOWED_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HR,
  Role.HOD,
];

export default function EmployeeActivitiesPage() {
  return (
    <ProtectedRoute allowedRoles={ALLOWED_ROLES}>
      <EmployeeActivitiesContent />
    </ProtectedRoute>
  );
}

function EmployeeActivitiesContent() {
  const { accessToken } = useAuthStore();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] =
    useState<DwmsActivityEmployee | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["dwms-activity-employees", debouncedSearch, page],
    queryFn: () =>
      DwmsService.searchActivityEmployees(accessToken!, {
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: !!accessToken,
    placeholderData: (previousData) => previousData,
  });

  const employees = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="w-full space-y-6 px-4 pt-8 pb-10 sm:px-6 lg:px-8">
      <ActivityTabs active="employees" />

      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Employee Activities</h1>
          <p className="mt-1 text-sm text-slate-500">
            Find an active employee by name or job role, then manage the activities assigned to them.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee name or job role..."
            aria-label="Search employee name or job role"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pr-11 pl-10 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
          />
          {isFetching && (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border-app bg-white shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading employees...
            </div>
          ) : error ? (
            <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {getDwmsErrorMessage(error, "Failed to search employees")}
            </div>
          ) : employees.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500">
              No active employees match this search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Employee Code</th>
                    <th className="px-5 py-3">Job Role</th>
                    <th className="px-5 py-3">Department</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((employee) => {
                    const selected = selectedEmployee?.id === employee.id;
                    return (
                      <tr
                        key={employee.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => setSelectedEmployee(employee)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedEmployee(employee);
                          }
                        }}
                        className={`cursor-pointer transition focus:outline-none ${
                          selected
                            ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                            : "hover:bg-slate-50/70 focus:bg-blue-50/50"
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-blue-50 p-2 text-blue-600">
                              <UserRound className="h-4 w-4" />
                            </span>
                            <span className="font-semibold text-slate-900">{employee.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-500">
                          {employee.employeeCode || "—"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{employee.jobTitle || "Unassigned"}</td>
                        <td className="px-5 py-4 text-slate-600">{employee.department?.name || "Unassigned"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.total > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">
                Showing {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} active employees
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {selectedEmployee ? (
        <section className="space-y-4" aria-live="polite">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Selected employee</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{selectedEmployee.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedEmployee.employeeCode || "No employee code"}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm text-slate-600 sm:items-end">
                <span className="inline-flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-blue-500" />
                  {selectedEmployee.jobTitle || "No job role"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  {selectedEmployee.department?.name || "No department"}
                </span>
              </div>
            </div>
          </div>

          {accessToken && (
            <EmployeeActivityManager
              key={selectedEmployee.id}
              employeeId={selectedEmployee.id}
              accessToken={accessToken}
              canManageActivities
              pageSize={10}
            />
          )}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Select an employee above to review and manage their activities.
        </div>
      )}
    </div>
  );
}
