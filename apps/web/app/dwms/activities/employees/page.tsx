"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/patterns/PageHeader";
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
import { DwmsDataField, DwmsMobileDataCard } from "../../components/DwmsResponsive";

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
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 px-4 pb-10 pt-6 sm:space-y-6 sm:px-6 sm:pt-8 lg:px-8">
      <ActivityTabs active="employees" />

      <section className="space-y-4">
        <div>
          <PageHeader title="Employee Activities" />
          <p className="mt-1 text-sm text-muted-foreground">
            Find an active employee by name or job role, then manage the activities assigned to them.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee name or job role..."
            aria-label="Search employee name or job role"
            className="min-h-11 w-full rounded-xl border border-border bg-card py-2.5 pr-11 pl-10 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info sm:rounded-full"
          />
          {isFetching && (
            <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-info" />
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading employees...
            </div>
          ) : error ? (
            <div className="m-4 rounded-xl border border-danger bg-danger-subtle p-4 text-sm text-danger">
              {getDwmsErrorMessage(error, "Failed to search employees")}
            </div>
          ) : employees.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">
              No active employees match this search.
            </div>
          ) : (
            <>
            <div className="space-y-3 p-3 md:hidden">
              {employees.map((employee) => {
                const selected = selectedEmployee?.id === employee.id;
                return (
                  <DwmsMobileDataCard
                    key={employee.id}
                    onClick={() => setSelectedEmployee(employee)}
                    className={selected ? "border-info bg-info-subtle/60 ring-1 ring-info" : undefined}
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-info-subtle p-2.5 text-info"><UserRound className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-foreground">{employee.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{employee.employeeCode || "No employee code"}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                      <DwmsDataField label="Job role">{employee.jobTitle || "Unassigned"}</DwmsDataField>
                      <DwmsDataField label="Department">{employee.department?.name || "Unassigned"}</DwmsDataField>
                    </div>
                  </DwmsMobileDataCard>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-full divide-y divide-border text-sm">
                <TableHeader className="bg-muted text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-5 py-3">Employee</TableHead>
                    <TableHead className="px-5 py-3">Employee Code</TableHead>
                    <TableHead className="px-5 py-3">Job Role</TableHead>
                    <TableHead className="px-5 py-3">Department</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {employees.map((employee) => {
                    const selected = selectedEmployee?.id === employee.id;
                    return (
                      <TableRow
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
                            ? "bg-info-subtle/80 ring-1 ring-inset ring-info"
                            : "hover:bg-muted/70 focus:bg-info-subtle/50"
                        }`}
                      >
                        <TableCell className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-info-subtle p-2 text-info">
                              <UserRound className="h-4 w-4" />
                            </span>
                            <span className="font-semibold text-foreground">{employee.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-4 font-mono text-xs text-muted-foreground">
                          {employee.employeeCode || "—"}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-muted-foreground">{employee.jobTitle || "Unassigned"}</TableCell>
                        <TableCell className="px-5 py-4 text-muted-foreground">{employee.department?.name || "Unassigned"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          )}

          {pagination && pagination.total > 0 && (
            <div className="flex flex-col gap-3 border-t border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} active employees
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  variant="ghost"
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {selectedEmployee ? (
        <section className="space-y-4" aria-live="polite">
          <div className="rounded-2xl border border-info bg-info-subtle/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-info">Selected employee</p>
                <h2 className="mt-1 text-lg font-bold text-foreground">{selectedEmployee.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedEmployee.employeeCode || "No employee code"}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
                <span className="inline-flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-info" />
                  {selectedEmployee.jobTitle || "No job role"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-info" />
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
        <div className="rounded-2xl border border-dashed border-border bg-muted p-10 text-center text-sm text-muted-foreground">
          Select an employee above to review and manage their activities.
        </div>
      )}
    </div>
  );
}
