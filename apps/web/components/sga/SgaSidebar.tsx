"use client";

import { LayoutGrid, Building2, BarChart3, BookOpen, Plus } from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";
import { useAuthStore } from "@/store/auth.store";

interface SgaSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const privilegedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGEMENT"]);

export function SgaSidebar(props: SgaSidebarProps) {
  const { user } = useAuthStore();
  const role = String(user?.roleLevel ?? "").toUpperCase();
  const groups: SidebarNavGroup[] = [
    {
      name: "Your work",
      items: [
        { label: "Overview", href: "/sga", icon: LayoutGrid },
        ...(privilegedRoles.has(role)
          ? [{ label: "All SGAs", href: "/sga/all", icon: Building2 }]
          : []),
      ],
    },
    {
      name: "Insights",
      items: [
        { label: "Reports", href: "/sga/reports", icon: BarChart3 },
        { label: "Documentation", shortLabel: "Docs", href: "/docs/sga", icon: BookOpen },
      ],
    },
  ];

  return (
    <ModuleSidebar
      {...props}
      id="sga-sidebar"
      title="Small Group Activities"
      homeHref="/sga"
      ariaLabel="Small group activity navigation"
      actions={[{ label: "New SGA", shortLabel: "New", href: "/sga/new", icon: Plus }]}
      groups={groups}
    />
  );
}
