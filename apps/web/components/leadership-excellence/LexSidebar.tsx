"use client";

import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileCheck2,
  ListChecks,
  MessageSquare,
  Network,
  ShieldCheck,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  ModuleSidebar,
  type SidebarNavGroup,
} from "@/components/shell/ModuleSidebar";
import { getLexArea, LEX_AREAS } from "./lex-navigation";

const ICONS: Record<string, LucideIcon[]> = {
  "01": [Compass, Building2, FileCheck2],
  "02": [Network, Users, CalendarDays],
  "03": [ClipboardList, ClipboardCheck, Target, Building2, Users, BarChart3],
  "04": [ClipboardList, ListChecks, MessageSquare],
  "05": [ShieldCheck, ChartNoAxesCombined, ClipboardList],
  "06": [ClipboardCheck, MessageSquare, Wrench],
  "07": [BookOpen, BarChart3, ChartNoAxesCombined],
};
const PLANNING_SHORT_LABELS = [
  "Findings",
  "Review",
  "Objectives",
  "Departments",
  "Individuals",
  "Results",
];

interface LexSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

/** The same sidebar, collapse rail and mobile drawer used by other modules. */
export function LexSidebar(props: LexSidebarProps) {
  const pathname = usePathname();
  const area = getLexArea(pathname) || LEX_AREAS[2];
  const groups: SidebarNavGroup[] = [
    {
      name: area.label,
      items: area.items.map((item, index) => ({
        label: item.label,
        href: item.href,
        icon: ICONS[area.id]?.[index] || ClipboardList,
        shortLabel:
          area.id === "03" ? PLANNING_SHORT_LABELS[index] : item.label,
      })),
    },
  ];

  return (
    <ModuleSidebar
      {...props}
      id="lex-sidebar"
      title="Leadership Excellence"
      subtitle={`Area ${area.id}`}
      homeHref={area.href}
      ariaLabel="Leadership Excellence navigation"
      groups={groups}
    />
  );
}
