"use client";

import { useQuery } from "@tanstack/react-query";
import { EmployeeService } from "@/services/employee.service";
import { useAuthStore } from "@/store/auth.store";

export type AssetOperator = {
  id: string;
  name: string;
  label: string;
  code?: string;
};
const MEMBER_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "HR"];

export function useAssetOperators(active = true) {
  const { user, accessToken } = useAuthStore();
  const orgId = user?.organizationId;
  const canViewMembers = !!user && MEMBER_ROLES.includes(user.roleLevel);
  const enabled = !!orgId && !!accessToken && canViewMembers;
  const query = useQuery({
    queryKey: ["tpm-operator-members", orgId, user?.userId, user?.roleLevel],
    enabled: enabled && active,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!orgId || !accessToken || !canViewMembers) {
        throw new Error("Organization member access is unavailable.");
      }
      const members = new Map<string, AssetOperator>();
      let page = 1;
      let pages = 1;
      do {
        signal.throwIfAborted();
        const response = await EmployeeService.getByOrganization(
          orgId,
          accessToken,
          page,
          100,
        );
        signal.throwIfAborted();
        for (const employee of response.data) {
          if (employee.organizationId !== orgId) continue;
          const name =
            [employee.firstName, employee.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            employee.employeeCode ||
            "Unnamed member";
          members.set(employee.id, {
            id: employee.id,
            name,
            code: employee.employeeCode ?? undefined,
            label: [name, employee.employeeCode, employee.department?.name]
              .filter(Boolean)
              .join(" · "),
          });
        }
        pages = response.pagination.pages;
        page++;
      } while (page <= pages);
      return [...members.values()].sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    },
  });

  return {
    members: enabled ? (query.data ?? []) : [],
    loading: enabled && active && query.isPending,
    failed: enabled && query.isError,
    enabled,
    canViewMembers,
    orgId,
    user,
    query,
  };
}
