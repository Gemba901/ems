"use client";

import { useMemo } from "react";
import { BookOpen, ClipboardCheck, LayoutDashboard, ListChecks, MapPin, Settings, Tag, Wrench } from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";
import { useFiveSCapabilities } from "@/hooks/five-s/useFiveS";

interface FiveSSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

// Settings appears only for 5S administrators; every other section is visible to all module users.
export function FiveSSidebar(props: FiveSSidebarProps) {
  const { data: caps } = useFiveSCapabilities();

  const groups = useMemo<SidebarNavGroup[]>(
    () => [
      {
        name: "5S Workplace",
        items: [
          { label: "Overview", href: "/five-s", icon: LayoutDashboard },
          { label: "Workplace Areas", href: "/five-s/areas", icon: MapPin, shortLabel: "Areas" },
          { label: "5S Audits", href: "/five-s/audits", icon: ClipboardCheck, shortLabel: "Audits" },
          { label: "Red-Tag Register", href: "/five-s/red-tags", icon: Tag, shortLabel: "Red tags" },
          { label: "Improvement Actions", href: "/five-s/actions", icon: Wrench, shortLabel: "Actions" },
          { label: "Standards & Routines", href: "/five-s/standards", icon: ListChecks, shortLabel: "Standards" },
          { label: "How to Use", href: "/five-s/guide", icon: BookOpen, shortLabel: "Guide" },
          ...(caps?.isModuleAdmin ? [{ label: "Settings", href: "/five-s/settings", icon: Settings }] : []),
        ],
      },
    ],
    [caps?.isModuleAdmin],
  );

  return (
    <ModuleSidebar
      {...props}
      id="five-s-sidebar"
      title="5S Workplace"
      homeHref="/five-s"
      ariaLabel="5S Workplace Organisation navigation"
      groups={groups}
    />
  );
}
