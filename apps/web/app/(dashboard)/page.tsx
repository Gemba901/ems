"use client";

import Link from "next/link";
import {
  Lightbulb,
  ArrowRight,
  Sparkles,
  FileEdit,
  ListChecks,
  ClipboardList,
  CalendarDays,
  UserCircle,
  Clock,
  Palmtree,
  ClipboardCheck,
  Factory,
  Users2,
  Layers,
  Compass,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { useQuery } from "@tanstack/react-query";
import DashboardHero from "@/components/DashboardHero";
import { DashboardTour } from "@/components/dashboard/DashboardTour";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Role } from "@/types/role";
import MyDayPanel from "@/components/dashboard/MyDayPanel";

// Module registry

type ModuleKey = "SIMS" | "EMS" | "CALENDAR" | "LEAVE" | "DWMS" | "STEEL" | "KAIZEN" | "SGA" | "WORK" | "FIVE_S" | "LEADERSHIP_EXCELLENCE" | "TIME_ATTENDANCE" | "PAYROLL" | "DOCUMENTS" | "PERFORMANCE" | "LEARNING" | "COMPLIANCE" | "ASSETS";

interface ModuleConfig {
  key: ModuleKey;
  label: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  href: string;
  /** If set, this module always shows for these roles (not org-gated). */
  systemRoles?: Role[];
  actions?: { label: string; href: string; icon: React.ElementType; roles?: Role[] }[];
}

const MODULE_REGISTRY: Record<string, ModuleConfig> = {
  SIMS: {
    key: "SIMS",
    label: "SIMS",
    tagline: "Suggestions & Ideas",
    description: "Submit improvement ideas, track their progress, and collaborate on solutions that move the organization forward.",
    icon: Lightbulb,
    color: "text-warning",
    bg: "bg-warning-subtle",
    href: "/sims",
    actions: [
      { label: "Submit an idea",    href: "/sims/new",            icon: FileEdit   },
      // { label: "My submissions",    href: "/sims/my-suggestions", icon: ListChecks },
      // { label: "Review Queue",      href: "/sims/queue",          icon: Inbox, roles: [Role.HOD, Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGEMENT] },
    ],
  },
  EMS: {
    key: "EMS",
    label: "Employee Master Data",
    tagline: "Record Completeness",
    description: "Track how complete your employee records are, identify gaps, and ensure all staff data is accurate and up to date.",
    icon: ClipboardList,
    color: "text-primary",
    bg: "bg-accent",
    href: "/ems",
    actions: [
      // { label: "Completeness Dashboard", href: "/ems",            icon: BarChart3,  roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR] },
      { label: "My Profile",             href: "/ems/my-profile", icon: UserCircle, roles: [Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE] },
      { label: "Onboarding Imports",     href: "/ems/onboarding", icon: ClipboardList, roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR] },
    ],
  },
  CALENDAR: {
    key: "CALENDAR",
    label: "Calendar",
    tagline: "Visit Scheduling",
    description: "View and schedule consultancy visits, request meeting dates, and keep your team aligned on upcoming engagements.",
    icon: CalendarDays,
    color: "text-info",
    bg: "bg-info-subtle",
    href: "/calendar",
    actions: [
      { label: "View Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  LEAVE: {
    key: "LEAVE",
    label: "Leave",
    tagline: "Leave Management",
    description: "Apply for leave, track your requests, and manage approvals — all in one place.",
    icon: Palmtree,
    color: "text-success",
    bg: "bg-success-subtle",
    href: "/leave",
    actions: [
      { label: "Apply for leave",    href: "/leave/apply",  icon: FileEdit   },
      // { label: "My requests",        href: "/leave",        icon: ListChecks },
      // { label: "Manage requests",    href: "/leave/manage", icon: Inbox,     roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD] },
    ],
  },
  DWMS: {
    key: "DWMS",
    label: "RTM",
    tagline: "Routine and Task Management",
    description: "Assign and track daily tasks, raise alerts, and stay on top of what's due across your department.",
    icon: ClipboardCheck,
    color: "text-danger",
    bg: "bg-danger-subtle",
    href: "/dwms",
    actions: [
      { label: "My tasks",       href: "/dwms/tasks?view=by-me", icon: ListChecks },
      // { label: "Raise an alert", href: "/dwms/alerts",        icon: AlertTriangle },
      // { label: "Approvals",      href: "/dwms/approvalTasks", icon: Inbox, roles: [Role.HOD, Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGEMENT] },
    ],
  },
  STEEL: {
    key: "STEEL",
    label: "Steel Manufacturing",
    tagline: "End-to-end steel production workflow",
    description: "Plan, source, receive, prepare, and manage steel production from start to finish. Follow each process from production planning and raw-material sourcing through material intake, preparation, production, quality checks, and final handover.",
    icon: Factory,
    color: "text-muted-foreground",
    bg: "bg-muted",
    href: "/steel",
    actions: [
      { label: "Start Steel Manufacturing", href: "/steel", icon: ArrowRight },
    ],
  },
  KAIZEN: {
    key: "KAIZEN",
    label: "Daily Gemba Kaizen",
    tagline: "Daily Gemba Walks",
    description: "Raise, track, and close out daily Kaizen improvements from the gemba, with before/after photos and status tracking.",
    icon: Sparkles,
    color: "text-info",
    bg: "bg-info-subtle",
    href: "/kaizen",
    actions: [
      { label: "New Kaizen", href: "/kaizen/new", icon: FileEdit },
    ],
  },
  SGA: {
    key: "SGA",
    label: "Small Group Activities",
    tagline: "Team CAPDo Improvement Cycles",
    description: "Run team-based Small Group Activities through a full Start → Team & Approve → Understand & Analyse → Plan & Implement → Check Results → Verify & Close cycle.",
    icon: Users2,
    color: "text-info",
    bg: "bg-info-subtle",
    href: "/sga",
    actions: [
      { label: "New SGA", href: "/sga/new", icon: FileEdit },
    ],
  },
  WORK: {
    key: "WORK",
    label: "Team Workspace",
    tagline: "Attendance & Project Tasks",
    description: "Clock in and out, see your tasks across projects, and plan team work in simple sprints.",
    icon: Clock,
    color: "text-info",
    bg: "bg-info-subtle",
    href: "/work",
    actions: [
      { label: "Open my day", href: "/work", icon: ArrowRight },
    ],
  },
  FIVE_S: {
    key: "FIVE_S",
    label: "5S Workplace",
    tagline: "20 Keys · Key 1: Cleaning and Organising",
    description: "Audit workplace areas with the 20-checkpoint 5S checksheet, register red-tagged items, follow up and verify improvement actions, and keep standards and routines in place.",
    icon: Layers,
    color: "text-success",
    bg: "bg-success-subtle",
    href: "/five-s",
    actions: [
      { label: "Open 5S overview", href: "/five-s", icon: ArrowRight },
      { label: "Start an audit", href: "/five-s/audits/new", icon: ClipboardCheck },
    ],
  },
  LEADERSHIP_EXCELLENCE: {
    key: "LEADERSHIP_EXCELLENCE",
    label: "Leadership Excellence",
    tagline: "BEES Pillar 01 · Direction to Performance",
    description: "Set the company direction, build the organisation framework and performance plans, record and verify results, run reviews and track performance across every level.",
    icon: Compass,
    color: "text-primary",
    bg: "bg-accent",
    href: "/leadership-excellence",
    actions: [
      { label: "Open Leadership Excellence", href: "/leadership-excellence", icon: ArrowRight },
    ],
  },
};


export default function DashboardPage() {
  const { user, accessToken } = useAuthStore();
  const modules = useQuery({
    queryKey: ["dashboard", user?.organizationId, user?.userId],
    queryFn: () => AuthService.getMyOrg(accessToken!),
    enabled: !!accessToken,
  });
  const activeModules = modules.data?.modules ?? [];
  // EMS card temporarily hidden from the dashboard; the module itself stays enabled.
  const enabledModules = activeModules.filter((key) => key !== "EMS").flatMap((key) => MODULE_REGISTRY[key] ? [MODULE_REGISTRY[key]] : []);

  return (
    <div className="mx-auto space-y-section pb-16">
      <DashboardTour />
      <DashboardHero />
      {!modules.isLoading && <MyDayPanel dwmsEnabled={activeModules.includes("DWMS")} />}

      <section data-tour="tour-modules" aria-labelledby="dashboard-modules-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="dashboard-modules-title" className="text-section-title">Your Modules</h2>
            <p className="text-body text-muted-foreground">Features active for your organization</p>
          </div>
          {enabledModules.length > 0 && <Badge variant="neutral">{enabledModules.length} active</Badge>}
        </div>

        {modules.isLoading ? (
          <LoadingState label="Loading modules…" />
        ) : modules.error ? (
          <ErrorState title="Unable to load modules" description={modules.error.message} onRetry={() => void modules.refetch()} />
        ) : enabledModules.length === 0 ? (
          <EmptyState title="No modules enabled yet" description="Contact your administrator to get started." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enabledModules.map((module) => {
              const actions = module.actions?.filter((action) =>
                !action.roles || (user?.roleLevel && action.roles.includes(user.roleLevel)),
              ) ?? [];
              return (
                <li key={module.key}>
                  <Card className="group relative h-full gap-3 p-card transition hover:ring-ring">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`grid size-11 place-items-center rounded-xl ${module.bg} ${module.color}`}>
                        <module.icon className="size-5" aria-hidden="true" />
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold">
                        <Link href={module.href} className="rounded-sm focus-visible:outline-ring after:absolute after:inset-0 after:rounded-xl">
                          {module.label}
                        </Link>
                      </h3>
                      <p className={`text-caption font-semibold ${module.color}`}>{module.tagline}</p>
                      <p className="text-caption text-muted-foreground">{module.description}</p>
                    </div>
                    {actions.length > 0 && (
                      <ul className="space-y-1 border-t border-border pt-3">
                        {actions.map((action) => (
                          <li key={action.href}>
                            <Link href={action.href} className="relative z-10 inline-flex items-center gap-2 rounded-sm text-caption font-medium hover:text-primary hover:underline focus-visible:outline-ring">
                              <action.icon className="size-4 shrink-0" aria-hidden="true" />
                              {action.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
