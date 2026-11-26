"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PageHeader } from "@/components/patterns/PageHeader";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Badge } from "@/components/ui/badge";

import { useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, EmployeeWithCompletion, EmploymentStatus, EMPLOYMENT_STATUS_LABELS,
  completionBg,
} from "@/services/ems.service";
import { Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

function CompletionPill({ pct }: { pct: number }) {
  return (
    <Badge variant={pct >= 97 ? "success" : pct >= 90 ? "info" : pct >= 75 ? "warning" : "danger"}>
      {pct}%
    </Badge>
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
  const error = queryError?.message;

  const filtered = search.trim()
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName} ${e.employeeCode ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
    : employees;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5">

        <PageHeader
          title="Employees"
          description="Review and edit employee records."
          breadcrumbs={[{ label: "Employee Management", href: "/ems" }, { label: "Employees" }]}
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              aria-label="Search by name or code"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
            />
          </div>
          <NativeSelect
            aria-label="Employment status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as EmploymentStatus | ""); setPage(1); }}
            className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 bg-card"
          >
            <option value="">All statuses</option>
            {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [EmploymentStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </NativeSelect>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div role="alert" className="px-5 py-4 text-sm text-danger">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Employees">
                <TableHeader>
                  <TableRow className="bg-muted text-muted-foreground border-b border-border">
                    <TableHead className="text-left px-5 py-3 font-semibold text-xs uppercase tracking-wide">Code</TableHead>
                    <TableHead className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Name</TableHead>
                    <TableHead className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Department</TableHead>
                    <TableHead className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Completion</TableHead>
                    <TableHead className="px-5 py-3" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {filtered.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-muted transition-colors">
                      <TableCell className="px-5 py-3 text-xs font-mono text-muted-foreground">{emp.employeeCode ?? "—"}</TableCell>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {emp.firstName} {emp.lastName}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{emp.department?.name ?? "—"}</TableCell>
                      <TableCell className="px-4 py-3">
                        <StatusBadge
                          status={emp.employmentStatus}
                          label={EMPLOYMENT_STATUS_LABELS[emp.employmentStatus]}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${completionBg(emp.completion.overall)}`}
                              style={{ width: `${emp.completion.overall}%` }}
                            />
                          </div>
                          <CompletionPill pct={emp.completion.overall} />
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        <Link
                          href={`/ems/employees/${emp.id}`}
                          aria-label={`Edit ${emp.firstName} ${emp.lastName}`}
                          className="text-xs font-medium text-info hover:text-info"
                        >
                          Edit
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                        No employees found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
              <p>{total} employees</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost"
                  aria-label="Previous page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs">{page} / {pages}</span>
                <Button variant="ghost"
                  aria-label="Next page"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
