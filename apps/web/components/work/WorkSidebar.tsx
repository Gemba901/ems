"use client";

import { useMemo } from "react";
import { BarChart3, Clock, FolderKanban, Home, Settings, Users } from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";
import { useWorkContext } from "@/hooks/work/useWork";

interface WorkSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

// My Team appears only for people with direct reports; Settings only for those who can edit it.
export function WorkSidebar(props: WorkSidebarProps) {
  const { data: context } = useWorkContext();

  const groups = useMemo<SidebarNavGroup[]>(
    () => [
      {
        name: "Team Workspace",
        items: [
          { label: "Home", href: "/work", icon: Home },
          { label: "Projects", href: "/work/projects", icon: FolderKanban },
          { label: "Attendance", href: "/work/attendance", icon: Clock },
          ...(context?.directReportCount ? [{ label: "My Team", href: "/work/team", icon: Users, shortLabel: "Team" }] : []),
          { label: "Analytics", href: "/work/analytics", icon: BarChart3 },
          ...(context?.canEditSettings ? [{ label: "Settings", href: "/work/settings", icon: Settings }] : []),
        ],
      },
    ],
    [context?.directReportCount, context?.canEditSettings],
  );

  return (
    <ModuleSidebar
      {...props}
      id="work-sidebar"
      title="Team Workspace"
      homeHref="/work"
      ariaLabel="Team Workspace navigation"
      groups={groups}
    />
  );
}
