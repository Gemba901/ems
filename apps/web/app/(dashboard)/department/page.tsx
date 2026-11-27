"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Mail, Phone } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { TenantImage } from "@/components/files/TenantImage";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeService } from "@/services/employee.service";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

const PAGE_SIZE = 20;

const ROLES: Record<string, { label: string; variant: "info" | "danger" | "warning" | "neutral" }> = {
  SUPER_ADMIN: { label: "Super Admin", variant: "info" },
  ADMIN: { label: "Admin", variant: "info" },
  MANAGEMENT: { label: "Management", variant: "info" },
  HR: { label: "HR", variant: "danger" },
  HOD: { label: "Head of Dept", variant: "warning" },
  EMPLOYEE: { label: "Employee", variant: "neutral" },
};

function DeptContent() {
  const { user, accessToken } = useAuthStore();
  const identity = [user?.userId, user?.organizationId];
  const [page, setPage] = useState(1);
  const profile = useQuery({
    queryKey: ["hod-profile", ...identity],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });
  const departmentId = profile.data?.departmentId;
  const team = useQuery({
    queryKey: ["employees-dept", ...identity, departmentId, page],
    queryFn: () => EmployeeService.getByDepartment(departmentId!, accessToken!, page, PAGE_SIZE),
    enabled: !!accessToken && !!departmentId,
  });
  const employees = team.data?.data ?? [];
  const total = team.data?.pagination.total;
  const pages = Math.max(1, team.data?.pagination.pages ?? 1);
  const pageLinks = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((number) => number >= 1 && number <= pages)
    .sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-7xl space-y-section">
      <PageHeader
        title="My Team"
        description={profile.data?.department?.name ?? "My Department"}
        actions={total !== undefined && <Badge variant="neutral">{total} {total === 1 ? "member" : "members"}</Badge>}
      />
      {profile.isLoading ? (
        <LoadingState label="Loading your profile…" />
      ) : profile.error ? (
        <ErrorState title="Could not load your profile" description={profile.error.message} onRetry={() => void profile.refetch()} />
      ) : !departmentId ? (
        <EmptyState title="You are not assigned to a department yet" description="Contact your administrator to get assigned to a department." />
      ) : team.isLoading ? (
        <LoadingState label="Loading team…" />
      ) : team.error ? (
        <ErrorState title="Could not load your team" description={team.error.message} onRetry={() => void team.refetch()} />
      ) : employees.length === 0 ? (
        <EmptyState title="No employees in this department yet" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => {
            const roleName = employee.user?.organizations?.[0]?.role?.name;
            const role = roleName ? ROLES[roleName] ?? ROLES.EMPLOYEE : null;
            const initials = `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();
            const phone = employee.phone ?? employee.user?.phone;
            return (
              <li key={employee.id}>
                <Link
                  href={`/operations/employees/${employee.id}`}
                  className="block h-full space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground transition hover:border-ring focus-visible:outline-ring sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    {employee.avatarUrl ? (
                      <TenantImage src={employee.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">{initials}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{employee.firstName} {employee.lastName}</p>
                      {role && <Badge variant={role.variant}>{role.label}</Badge>}
                    </div>
                    <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="space-y-2 border-t border-border pt-3 text-caption text-muted-foreground">
                    {employee.email && <p className="flex items-center gap-2"><Mail aria-hidden="true" className="size-4 shrink-0" /><span className="break-all">{employee.email}</span></p>}
                    {phone && <p className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4 shrink-0" />{phone}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && !team.error && (
        <nav aria-label="Department pages" className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-muted-foreground">Page {page} of {pages}</p>
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            {pageLinks.map((number, index) => (
              <span key={number} className="inline-flex items-center gap-1">
                {index > 0 && number - pageLinks[index - 1] > 1 && <span aria-hidden="true" className="text-muted-foreground">…</span>}
                <Button
                  type="button"
                  variant={page === number ? "default" : "ghost"}
                  aria-label={`Page ${number}`}
                  aria-current={page === number ? "page" : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </Button>
              </span>
            ))}
            <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default function DepartmentPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.HOD, Role.MANAGEMENT, Role.SUPER_ADMIN, Role.ADMIN]}>
      <DeptContent />
    </ProtectedRoute>
  );
}
