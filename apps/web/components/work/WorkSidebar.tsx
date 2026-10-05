"use client";

import { Home, FolderKanban, Clock } from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";

interface WorkSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const groups: SidebarNavGroup[] = [
  {
    name: "Team Workspace",
    items: [
      { label: "Home", href: "/work", icon: Home },
      { label: "Projects", href: "/work/projects", icon: FolderKanban },
      { label: "Attendance", href: "/work/attendance", icon: Clock },
    ],
  },
];

export function WorkSidebar(props: WorkSidebarProps) {
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
