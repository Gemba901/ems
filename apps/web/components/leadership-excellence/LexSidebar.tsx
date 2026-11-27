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
  Eye,
  Gem,
  HelpCircle,
  Landmark,
  ListChecks,
  MessageSquare,
  Network,
  ShieldCheck,
  Target,
  Telescope,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  ModuleSidebar,
  type SidebarNavGroup,
} from "@/components/shell/ModuleSidebar";
import { useAuthStore } from "@/store/auth.store";
import { DIRECTION_EDITORS } from "@/components/leadership-excellence/strategic-direction/roles";
import { DIRECTION_REVIEW, getLexArea, LEX_AREAS } from "./lex-navigation";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, LucideIcon[]> = {
  "01": [Building2, Telescope, Compass, Gem, Landmark, Eye],
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
  const role = useAuthStore((s) => s.user?.roleLevel);
  // Only editors have the review section, so readers don't get a link to it.
  const canReview = !!role && DIRECTION_EDITORS.includes(role);
  const groups: SidebarNavGroup[] = [
    {
      name: area.label,
      items: area.items
        .map((item, index) => ({
        label: item.label,
        href: item.href,
        icon: ICONS[area.id]?.[index] || ClipboardList,
        shortLabel:
          area.id === "03" ? PLANNING_SHORT_LABELS[index] : item.label,
        }))
        .filter((item) => canReview || item.href !== DIRECTION_REVIEW),
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
      footer={
        area.id === "03"
          ? (collapsed) => (
              <Button variant="ghost"
                type="button"
                onClick={() => {
                  props.onClose?.();
                  window.dispatchEvent(new Event("planning-programme-guide"));
                }}
                className={`h-auto whitespace-normal flex items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${collapsed ? "w-[72px] flex-col gap-1 px-0.5 py-2 text-[10.5px]" : "w-full gap-3 px-3 py-2 text-sm"}`}
              >
                <HelpCircle size={18} strokeWidth={1.6} aria-hidden="true" />
                Guide
              </Button>
            )
          : undefined
      }
    />
  );
}
