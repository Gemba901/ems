"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lightbulb,
  CalendarClock,
  Receipt,
  FolderLock,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  Package,
  Users,
  ArrowRight,
  Sparkles,
  ChevronRight,
  FileEdit,
  ListChecks,
  Inbox,
  ClipboardList,
  CalendarDays,
  UserCircle,
  Clock,
  Loader2,
  Palmtree,
  Bell,
  Megaphone,
  Info,
  AlertTriangle,
  Pin,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import { useQuery } from "@tanstack/react-query";
import DashboardHero from "@/components/DashboardHero";
import DashboardRoleSection from "@/components/DashboardRoleSection";
import { Role } from "@/types/role";
import { CalendarService, VISIT_DOT_COLOR, VISIT_STATUS_LABELS } from "@/services/calendar.service";
import { LeaveService, LEAVE_TYPE_LABELS } from "@/services/leave.service";
import { NoticeService, Notice, NoticeType } from "@/services/notice.service";

// Module registry

type ModuleKey = "SIMS" | "EMS" | "CALENDAR" | "LEAVE" | "TIME_ATTENDANCE" | "PAYROLL" | "DOCUMENTS" | "PERFORMANCE" | "LEARNING" | "COMPLIANCE" | "ASSETS";

interface ModuleConfig {
  key: ModuleKey;
  label: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  ring: string;
  href?: string;
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
    color: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    href: "/sims",
    actions: [
      { label: "Submit an idea",    href: "/sims/new",            icon: FileEdit   },
      { label: "My submissions",    href: "/sims/my-suggestions", icon: ListChecks },
      { label: "Review Queue",      href: "/sims/queue",          icon: Inbox, roles: [Role.HOD, Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGEMENT] },
    ],
  },
  EMS: {
    key: "EMS",
    label: "Employee Master Data",
    tagline: "Record Completeness",
    description: "Track how complete your employee records are, identify gaps, and ensure all staff data is accurate and up to date.",
    icon: ClipboardList,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
    href: "/ems",
    actions: [
      { label: "Completeness Dashboard", href: "/ems",            icon: BarChart3,  roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR] },
      { label: "My Profile",             href: "/ems/my-profile", icon: UserCircle, roles: [Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE] },
    ],
  },
  CALENDAR: {
    key: "CALENDAR",
    label: "Calendar",
    tagline: "Visit Scheduling",
    description: "View and schedule consultancy visits, request meeting dates, and keep your team aligned on upcoming engagements.",
    icon: CalendarDays,
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
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
    color: "text-green-600",
    bg: "bg-green-50",
    ring: "ring-green-200",
    href: "/leave",
    actions: [
      { label: "Apply for leave",    href: "/leave/apply",  icon: FileEdit   },
      { label: "My requests",        href: "/leave",        icon: ListChecks },
      { label: "Manage requests",    href: "/leave/manage", icon: Inbox,     roles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR, Role.HOD] },
    ],
  },
};


// reminders
const NOTICE_ICON: Record<NoticeType, React.ElementType> = {
  ANNOUNCEMENT: Megaphone,
  REMINDER:     Bell,
  INFO:         Info,
  ALERT:        AlertTriangle,
};

const NOTICE_CHIP_STYLE: Record<NoticeType, string> = {
  ANNOUNCEMENT: "bg-indigo-50 border-indigo-200 text-indigo-700",
  REMINDER:     "bg-amber-50  border-amber-200  text-amber-700",
  INFO:         "bg-white     border-slate-200   text-slate-600",
  ALERT:        "bg-red-50   border-red-200    text-red-700",
};

const NOTICE_ICON_COLOR: Record<NoticeType, string> = {
  ANNOUNCEMENT: "text-indigo-500",
  REMINDER:     "text-amber-500",
  INFO:         "text-slate-400",
  ALERT:        "text-red-500",
};

function fmtNoticeDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function RemindersStrip({ token }: { token: string }) {
  const { data: notices = [], isLoading } = useQuery({
    queryKey: ["notices"],
    queryFn: () => NoticeService.getNotices(token),
    enabled: !!token,
    staleTime: 60_000,
  });

  if (isLoading) return null;
  if (notices.length === 0) return null;

  return (
    <div className="flex items-center gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      <span className="text-xs font-medium text-slate-400 shrink-0">Notices</span>
      <div className="flex items-center gap-2">
        {notices.map((n: Notice) => {
          const Icon = NOTICE_ICON[n.type];
          return (
            <div
              key={n.id}
              className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${NOTICE_CHIP_STYLE[n.type]}`}
            >
              <Icon className={`h-3 w-3 shrink-0 ${NOTICE_ICON_COLOR[n.type]}`} />
              <span className="font-medium whitespace-nowrap">{n.title}</span>
              {n.pinned && <Pin className="h-2.5 w-2.5 shrink-0 opacity-40" />}
              <span className="text-[10px] opacity-60 whitespace-nowrap">{fmtNoticeDate(n.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// upcoming modules

const UPCOMING_MODULES: Omit<ModuleConfig, "key" | "href" | "actions">[] = [
  {
    label: "Time & Attendance",
    tagline: "Shifts & Timesheets",
    description: "Log working hours, manage shift rosters, and get visibility into your attendance history.",
    icon: CalendarClock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  {
    label: "Payroll & Finance",
    tagline: "Payslips & Expenses",
    description: "Access payslips, tax summaries, and expense claims — all in one secure place.",
    icon: Receipt,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  {
    label: "Document Center",
    tagline: "Contracts & Compliance",
    description: "Securely store, sign, and retrieve employment contracts, compliance documents, and policy files.",
    icon: FolderLock,
    color: "text-purple-600",
    bg: "bg-purple-50",
    ring: "ring-purple-200",
  },
  {
    label: "Performance Reviews",
    tagline: "Goals & Appraisals",
    description: "Set SMART goals, conduct structured appraisals, and track performance trends over time.",
    icon: BarChart3,
    color: "text-rose-600",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
  {
    label: "Learning & Development",
    tagline: "Courses & Certifications",
    description: "Assign training courses, track completion, and manage employee certifications and skill growth.",
    icon: GraduationCap,
    color: "text-sky-600",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
  },
  {
    label: "Compliance & Safety",
    tagline: "Audits & Incidents",
    description: "Manage health & safety audits, incident reports, and regulatory compliance checklists.",
    icon: ShieldCheck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    ring: "ring-teal-200",
  },
  {
    label: "Asset Management",
    tagline: "Equipment & Inventory",
    description: "Track company assets assigned to employees, manage maintenance schedules, and run inventory audits.",
    icon: Package,
    color: "text-orange-600",
    bg: "bg-orange-50",
    ring: "ring-orange-200",
  },
  {
    label: "HR & Onboarding",
    tagline: "People Operations",
    description: "Streamline new-hire onboarding, manage org structure, and keep employee records up to date.",
    icon: Users,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
  },
];


// Page

export default function DashboardPage() {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();

  const { data: orgData, isLoading: loadingModules } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => AuthService.getMyOrg(accessToken!),
    enabled: !!accessToken,
  });

  const activeModules: string[] = orgData?.modules ?? [];

  const enabledModules = activeModules
    .map((key) => MODULE_REGISTRY[key])
    .filter(Boolean);

  const upcomingToShow = UPCOMING_MODULES.filter(
    (m) => !activeModules.includes((m as any).key)
  );

  const canSeeExploreMore = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT"].includes(user?.roleLevel ?? "");

  return (
    <div className="mx-auto space-y-10 pb-16">

      <DashboardHero />

      {accessToken && <RemindersStrip token={accessToken} />}

      {/* <DashboardRoleSection /> */}

      {/* Active modules */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your Modules</h2>
            <p className="text-sm text-slate-500 mt-0.5">Features active for your organization</p>
          </div>
          {!loadingModules && enabledModules.length > 0 && (
            <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100">
              {enabledModules.length} active
            </span>
          )}
        </div>

        {loadingModules && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
            <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Loading modules...
          </div>
        )}

        {!loadingModules && enabledModules.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No modules enabled yet</p>
            <p className="text-xs text-slate-400 mt-1">Contact your administrator to get started.</p>
          </div>
        )}

        {!loadingModules && enabledModules.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {enabledModules.map((mod) => (
              <div
                key={mod.key}
                onClick={() => router.push(mod.href!)}
                className={`group cursor-pointer h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:ring-2 ${mod.ring} hover:border-transparent`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${mod.bg}`}>
                    <mod.icon className={`h-5 w-5 ${mod.color}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors mt-1" />
                </div>
                <p className="text-base font-bold text-slate-900">{mod.label}</p>
                <p className={`text-xs font-semibold mt-0.5 ${mod.color}`}>{mod.tagline}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">{mod.description}</p>

                {mod.actions && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
                    {mod.actions
                      .filter((action) => !action.roles || (user?.roleLevel && action.roles.includes(user.roleLevel as Role)))
                      .map((action) => (
                        <Link
                          key={action.href}
                          href={action.href}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                          <action.icon className="h-3.5 w-3.5 shrink-0" />
                          {action.label}
                          <ChevronRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      ))}
                  </div>
                )}

                {mod.key === "CALENDAR" && accessToken && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {/* <UpcomingVisitsWidget token={accessToken} /> */}
                  </div>
                )}
                {mod.key === "LEAVE" && accessToken && (
                  <div onClick={(e) => e.stopPropagation()}>
                    {/* <LeaveBalanceWidget token={accessToken} /> */}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Explore more */}
      {canSeeExploreMore && upcomingToShow.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Explore More</h2>
              <p className="text-sm text-slate-500 mt-0.5">More modules coming to the Gemba platform</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {upcomingToShow.map((mod) => (
              <div
                key={mod.label}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm opacity-80 hover:opacity-100 transition-opacity"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${mod.bg} mb-3`}>
                  <mod.icon className={`h-4 w-4 ${mod.color}`} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{mod.label}</p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${mod.color}`}>{mod.tagline}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed line-clamp-2">{mod.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
