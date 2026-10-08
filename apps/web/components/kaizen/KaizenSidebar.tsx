"use client";

import { LayoutGrid, Building2, BarChart3, BookOpen, Plus } from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";
import { useAuthStore } from "@/store/auth.store";

interface KaizenSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const privilegedRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGEMENT"]);

export function KaizenSidebar(props: KaizenSidebarProps) {
  const { user } = useAuthStore();
  const role = String(user?.roleLevel ?? "").toUpperCase();
  const groups: SidebarNavGroup[] = [
    {
      name: "Your work",
      items: [
        { label: "Overview", href: "/kaizen", icon: LayoutGrid },
        ...(privilegedRoles.has(role)
          ? [{ label: "All Kaizens", href: "/kaizen/all", icon: Building2 }]
          : []),
      ],
    },
    {
      name: "Insights",
      items: [
        { label: "Reports", href: "/kaizen/reports", icon: BarChart3 },
        { label: "Documentation", shortLabel: "Docs", href: "/docs/kaizen", icon: BookOpen },
      ],
    },
  ];

  return (
    <ModuleSidebar
      {...props}
      id="kaizen-sidebar"
      title="Daily Gemba Kaizen"
      homeHref="/kaizen"
      ariaLabel="Daily kaizen navigation"
      actions={[{ label: "New Kaizen", shortLabel: "New", href: "/kaizen/new", icon: Plus }]}
      groups={groups}
    />
  );
}
