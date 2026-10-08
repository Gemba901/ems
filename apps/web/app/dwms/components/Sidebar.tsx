"use client";

import {
  Home,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  BookOpen,
  Settings2,
  Plus,
  BellPlus,
  Repeat,
  TriangleAlert,
} from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";
import { useAuthStore } from "@/store/auth.store";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const managementRoles = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

export function Sidebar(props: SidebarProps) {
  const { user } = useAuthStore();
  const role = String(user?.roleLevel ?? "").toUpperCase();
  const groups: SidebarNavGroup[] = [
    {
      name: "Your work",
      items: [
        { label: "Home", href: "/dwms", icon: Home },
        { label: "Routine Work", shortLabel: "Routine", href: "/dwms/routine-work", icon: Repeat },
        { label: "Assigned Task", shortLabel: "Tasks", href: "/dwms/tasks", icon: ClipboardList },
        { label: "Alert", href: "/dwms/alerts", icon: AlertTriangle },
        { label: "Abnormalities", href: "/dwms/abnormalities", icon: TriangleAlert },
        { label: "Approvals", href: "/dwms/approvalTasks", icon: ClipboardCheck },
      ],
    },
    {
      name: "Manage",
      items: [
        { label: "Reports", href: "/dwms/dashboard", icon: BarChart3 },
        ...(managementRoles.has(role) || role === "HOD"
          ? [{ label: "Activities", href: "/dwms/activities", icon: BookOpenCheck }]
          : []),
        ...(managementRoles.has(role)
          ? [{ label: "Settings", href: "/dwms/settings", icon: Settings2 }]
          : []),
        { label: "Documentation", shortLabel: "Docs", href: "/docs/dwms", icon: BookOpen },
      ],
    },
  ];

  return (
    <ModuleSidebar
      {...props}
      id="dwms-sidebar"
      title="Daily Work Management"
      homeHref="/dwms"
      ariaLabel="Daily work navigation"
      actions={[
        { label: "Assign task", shortLabel: "Assign", href: "/dwms/actions/new?mode=TASK", icon: Plus },
        {
          label: "Raise alert",
          shortLabel: "Alert",
          href: "/dwms/actions/new?mode=ALERT",
          icon: BellPlus,
          variant: "secondary",
        },
      ]}
      groups={groups}
    />
  );
}
