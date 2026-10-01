"use client"

import {
  LayoutGrid,
  CalendarDays,
  ClipboardCheck,
  Users,
  Settings,
  Plus,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { ModuleSidebar, type SidebarNavItem } from "@/components/shell/ModuleSidebar";

interface LeaveSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

type RoleNavItem = SidebarNavItem & { allowedRoles: Role[] };

const LEAVE_NAV: RoleNavItem[] = [
  {
    label: "Overview",
    href: "/leave",
    icon: LayoutGrid,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "Company Calendar",
    shortLabel: "Calendar",
    href: "/leave/calendar",
    icon: CalendarDays,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "Approval Workspace",
    shortLabel: "Approvals",
    href: "/leave/manage",
    icon: ClipboardCheck,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD],
  },
  {
    label: "Employees",
    href: "/leave/employees",
    icon: Users,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD],
  },
];

const MANAGE_NAV: RoleNavItem[] = [
  {
    label: "Policy",
    href: "/leave/policy",
    icon: Settings,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR],
  },
];

export function LeaveSidebar(props: LeaveSidebarProps) {
  const user = useAuthStore((state) => state.user);
  const userRole = user?.roleLevel;
  const byRole = (item: RoleNavItem) => !!userRole && item.allowedRoles.includes(userRole);

  return (
    <ModuleSidebar
      {...props}
      id="leave-sidebar"
      title="Leave Management"
      subtitle="HR Module"
      homeHref="/leave"
      ariaLabel="Leave navigation"
      actions={[{ label: "Apply for Leave", shortLabel: "Apply", href: "/leave/apply", icon: Plus }]}
      groups={[
        { name: "Leave", items: LEAVE_NAV.filter(byRole) },
        { name: "Manage", items: MANAGE_NAV.filter(byRole) },
      ]}
    />
  );
}
