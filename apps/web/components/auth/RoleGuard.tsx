"use client";

import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Role[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user } = useAuthStore();

  if (!user || !allowedRoles.includes(user.roleLevel)) {
    return null; 
  }

  return <>{children}</>;
}