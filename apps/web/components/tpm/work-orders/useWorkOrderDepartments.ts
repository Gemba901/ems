"use client";

import { useQuery } from "@tanstack/react-query";
import { EmployeeService } from "@/services/employee.service";
import { useAuthStore } from "@/store/auth.store";

const MEMBER_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "HOD", "HR"];

export function useWorkOrderDepartments() {
  const { user, accessToken } = useAuthStore();
  const orgId = user?.organizationId;
  const enabled =
    !!orgId && !!accessToken && !!user && MEMBER_ROLES.includes(user.roleLevel);
  const query = useQuery({
    queryKey: [
      "tpm-work-order-departments",
      orgId,
      user?.userId,
      user?.roleLevel,
    ],
    enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!orgId || !accessToken)
        throw new Error("Organization access is unavailable.");
      signal.throwIfAborted();
      const departments = await EmployeeService.getDepartments(
        orgId,
        accessToken,
      );
      signal.throwIfAborted();
      return departments
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  return {
    departments: enabled ? (query.data ?? []) : [],
    loading: enabled && query.isPending,
    failed: enabled && query.isError,
    enabled,
  };
}
