"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarCog,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Eye,
  FileBarChart,
  Flag,
  HandHelping,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListTodo,
  MessagesSquare,
  Network,
  PenLine,
  Target,
  Users,
  UserSquare2,
  Wrench,
} from "lucide-react";
import { ModuleSidebar, type SidebarNavGroup } from "@/components/shell/ModuleSidebar";

interface LexSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const BASE = "/leadership-excellence";

// One group per area, one item per sub-component, in prototype order (01 → 07).
// Every route already exists, so area owners never need to edit this file.
const GROUPS: SidebarNavGroup[] = [
  {
    name: "Overview",
    items: [{ label: "Overview", href: BASE, icon: LayoutDashboard, exact: true }],
  },
  {
    name: "01 Strategic Direction",
    items: [
      { label: "Company Direction", shortLabel: "Direction", href: `${BASE}/strategic-direction/company-direction`, icon: Compass },
      { label: "Excellence Pillars", shortLabel: "Pillars", href: `${BASE}/strategic-direction/pillars`, icon: Landmark },
      { label: "Preview & Finalise", shortLabel: "Preview", href: `${BASE}/strategic-direction/preview`, icon: Eye },
    ],
  },
  {
    name: "02 Organisation Framework",
    items: [
      { label: "EMS & Organogram", shortLabel: "Organogram", href: `${BASE}/organisation-framework/ems-organogram`, icon: Network },
      { label: "Positions & Reporting", shortLabel: "Positions", href: `${BASE}/organisation-framework/positions-reporting`, icon: UserSquare2 },
      { label: "Rules & Calendar", shortLabel: "Rules", href: `${BASE}/organisation-framework/rules-calendar`, icon: CalendarCog },
    ],
  },
  {
    name: "03 Performance Planning",
    items: [
      { label: "Objectives & Company Goals", shortLabel: "Objectives", href: `${BASE}/performance-planning/objectives`, icon: Target },
      { label: "Department Plans", shortLabel: "Dept plans", href: `${BASE}/performance-planning/department-plans`, icon: Flag },
      { label: "Team & Individual Plans", shortLabel: "Team plans", href: `${BASE}/performance-planning/team-individual-plans`, icon: Users },
      { label: "Check & Approve", shortLabel: "Approve", href: `${BASE}/performance-planning/check-approve`, icon: ClipboardCheck },
    ],
  },
  {
    name: "04 Execution",
    items: [
      { label: "Results Entry", shortLabel: "Results", href: `${BASE}/execution/results-entry`, icon: PenLine },
      { label: "Delivery Actions", shortLabel: "Actions", href: `${BASE}/execution/delivery-actions`, icon: ListTodo },
      { label: "Support Requests", shortLabel: "Support", href: `${BASE}/execution/support-requests`, icon: HandHelping },
    ],
  },
  {
    name: "05 Monitoring & Control",
    items: [
      { label: "Verify Results", shortLabel: "Verify", href: `${BASE}/monitoring-control/verify-results`, icon: CheckCircle2 },
      { label: "Performance & Gaps", shortLabel: "Gaps", href: `${BASE}/monitoring-control/performance-gaps`, icon: Activity },
      { label: "Alerts & Follow-up", shortLabel: "Alerts", href: `${BASE}/monitoring-control/alerts`, icon: AlertTriangle },
    ],
  },
  {
    name: "06 Reviews & Development",
    items: [
      { label: "Reviews", href: `${BASE}/reviews-development/reviews`, icon: LineChart },
      { label: "Feedback & Coaching", shortLabel: "Coaching", href: `${BASE}/reviews-development/feedback-coaching`, icon: MessagesSquare },
      { label: "Improvement Actions", shortLabel: "Improve", href: `${BASE}/reviews-development/improvement-actions`, icon: Wrench },
    ],
  },
  {
    name: "07 Performance Intelligence",
    items: [
      { label: "KRA & KPI Libraries", shortLabel: "Libraries", href: `${BASE}/performance-intelligence/libraries`, icon: BookOpen },
      { label: "Dashboards", href: `${BASE}/performance-intelligence/dashboards`, icon: BarChart3 },
      { label: "Reports", href: `${BASE}/performance-intelligence/reports`, icon: FileBarChart },
    ],
  },
];

export function LexSidebar(props: LexSidebarProps) {
  return (
    <ModuleSidebar
      {...props}
      id="lex-sidebar"
      title="Leadership Excellence"
      homeHref={BASE}
      ariaLabel="Leadership Excellence navigation"
      groups={GROUPS}
    />
  );
}
