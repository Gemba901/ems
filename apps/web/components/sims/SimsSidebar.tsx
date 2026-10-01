"use client"

import {
  Lightbulb,
  Plus,
  LayoutGrid,
  BarChart2,
  Archive,
  Settings,
  ClipboardList,
  Users,
  List,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { CommitteeService } from "@/services/committee.service";
import { ModuleSidebar, type SidebarNavItem } from "@/components/shell/ModuleSidebar";

interface SimsSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const SIMS_NAV: (SidebarNavItem & { allowedRoles: Role[] })[] = [
  {
    label: "Overview",
    href: "/sims",
    icon: LayoutGrid,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE],
  },
  {
    label: "All Suggestions",
    shortLabel: "All",
    href: "/sims/all",
    icon: List,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD],
  },
  {
    label: "My Suggestions",
    shortLabel: "Mine",
    href: "/sims/my-suggestions",
    icon: Lightbulb,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "Review Queue",
    shortLabel: "Review",
    href: "/sims/queue",
    icon: ClipboardList,
    allowedRoles: [Role.HOD],
  },
  {
    label: "Analytics",
    href: "/sims/analytics",
    icon: BarChart2,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
  {
    label: "Committees",
    href: "/sims/committees",
    icon: Users,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE],
  },
];

const MANAGE_NAV: SidebarNavItem[] = [
  { label: "Closed", href: "/sims/archived", icon: Archive },
  { label: "Settings", href: "/sims/settings", icon: Settings },
];

export function SimsSidebar(props: SimsSidebarProps) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const userRole = user?.roleLevel;

  // A plain employee who sits on a steering committee gets org-wide read access to SIMS
  // (enforced server-side in getAllSuggestions) — surface "All Suggestions" for them too.
  const { data: myCommittees = [] } = useQuery({
    queryKey: ["my-committees", "sidebar"],
    queryFn: () => CommitteeService.getMyCommittees(accessToken!),
    enabled: userRole === Role.EMPLOYEE && !!accessToken,
  });
  const isCommitteeMember = myCommittees.length > 0;

  const filteredNav = SIMS_NAV.filter((item) => {
    if (!userRole) return false;
    if (item.href === "/sims/all" && userRole === Role.EMPLOYEE) return isCommitteeMember;
    return item.allowedRoles.includes(userRole);
  });

  return (
    <ModuleSidebar
      {...props}
      id="sims-sidebar"
      title="Suggestions & Ideas"
      subtitle="SIMS"
      homeHref="/sims"
      ariaLabel="Suggestions navigation"
      actions={[{ label: "New Suggestion", shortLabel: "New", href: "/sims/new", icon: Plus }]}
      groups={[
        { name: "Suggestions", items: filteredNav },
        { name: "Manage", items: MANAGE_NAV },
      ]}
    />
  );
}
