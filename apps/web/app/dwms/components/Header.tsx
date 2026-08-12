"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarDays, Info } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { NotificationsBell } from "@/components/NotificationsBell";

interface HeaderProps {
  onMenuClick?: () => void;
}

const DWMS_HEADERS: Record<string, { title: string; subtitle: string; purpose: string; dotColor: string }> = {
  "/dwms": {
    title: "Daily Work Management System",
    subtitle: "View and manage your tasks",
    purpose: "This is your daily operations hub. Use this page to view your tasks due today, track alert statuses, monitor productivity metrics, and manage your immediate work schedule.",
    dotColor: "bg-emerald-500"
  },
  "/dwms/tasks": {
    title: "My tasks",
    subtitle: "View and manage your tasks",
    purpose: "This page lists all tasks assigned to you. Filter by status (Pending, Completed, Overdue) or search by keywords to track, update, or acknowledge task executions.",
    dotColor: "bg-blue-500"
  },
  "/dwms/activities": {
    title: "Activity Master",
    subtitle: "Manage standard activity blueprints used to create DWMS tasks.",
    purpose: "Use the Activity Master to maintain reusable activity blueprints for DWMS tasks. Search by activity details, filter by status, and add new standard activities for task creation.",
    dotColor: "bg-blue-500"
  },
  "/dwms/activities/ingestions": {
    title: "Activity Ingestion History",
    subtitle: "Review uploaded sheets and row-level ingestion results.",
    purpose: "Use this page to audit Activity Sheet imports, see how many rows created activities and tasks, and inspect declined rows with their exact failure reason.",
    dotColor: "bg-emerald-500"
  },
  "/dwms/alerts": {
    title: "Alerts Dashboard",
    subtitle: "Track operational abnormalities, raise new alerts, and manage resolution closures.",
    purpose: "Use the Alerts page to raise operational alarms and follow up on corrective actions. Alerters and HODs can track issue resolution and closing notes.",
    dotColor: "bg-rose-500"
  },
  "/dwms/actions/new": {
    title: "Create Action",
    subtitle: "Create a task or raise an operational alert",
    purpose: "Use this page to choose the right action type. Create assigned work for your team or raise alerts for operational abnormalities that need follow-up.",
    dotColor: "bg-blue-500"
  },
  "/dwms/dashboard": {
    title: "Operations Dashboard",
    subtitle: "Track task execution, completion trends, compliance performance, and operational metrics.",
    purpose: "This analytics dashboard provides compliance reports, department-wide heatmap tables, performance comparisons, and time-to-acknowledge metrics for supervisors and HODs.",
    dotColor: "bg-violet-500"
  },
  "/dwms/assignedTasks": {
    title: "Assigned Tasks",
    subtitle: "Track tasks delegated to your team",
    purpose: "View history, acknowledgement statuses, and completion notes for tasks you assigned to your reportees. Filter by overdue, completed, pending, or not acknowledged tasks.",
    dotColor: "bg-slate-400"
  },
  "/dwms/approvalTasks": {
    title: "Approvals",
    subtitle: "Review tasks waiting for your approval",
    purpose: "Use this page to review tasks submitted by employees where you are selected as the approver. Approving a task moves it from Approval Pending to Done.",
    dotColor: "bg-emerald-500"
  },
  "/dwms/settings": {
    title: "DWMS Settings",
    subtitle: "Configure permissions and escalation rules",
    purpose: "Manage task creation rules, approval constraints, alert visibility, analytics visibility, and escalation contacts for the organization.",
    dotColor: "bg-slate-700"
  }
};

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const dwmsHeader = DWMS_HEADERS[pathname] || (pathname.startsWith("/dwms/activities/ingestions/") ? DWMS_HEADERS["/dwms/activities/ingestions"] : null);

  return (
    <header className="flex min-h-[4.5rem] items-center justify-between gap-3 bg-transparent px-4 py-3 lg:min-h-[5rem] lg:px-8">

      {/* Left: brand + page context */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100 cursor-pointer animate-in fade-in"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {dwmsHeader && (
          <div className="min-w-0 flex-1 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-xl font-extrabold tracking-tight text-slate-900 leading-tight sm:text-3xl">
                {dwmsHeader.title}
              </h1>
              <div className="relative shrink-0 group">
                <button
                  type="button"
                  title="Page Info"
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer select-none flex items-center justify-center"
                >
                  <Info className="h-4.5 w-4.5" strokeWidth={2.2} />
                </button>
                
                {/* Purpose Popover */}
                <div className="absolute left-1/2 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 transition-all duration-200 origin-top sm:left-0 sm:translate-x-0 sm:origin-top-left">
                  <h4 className="font-bold text-xs text-slate-900 mb-1.5 flex items-center gap-1.5">
                    About this Page
                  </h4>
                  <p className="text-[11px] font-medium text-slate-500 leading-relaxed whitespace-normal">
                    {dwmsHeader.purpose}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 hidden sm:block mt-0.5">
              {dwmsHeader.subtitle}
            </p>
          </div>
        )}
      </div>

      {/* Right: calendar + notifications + user */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-4">
        <Link
          href="/calendar"
          title="My Calendar"
          className={`h-9 w-9 flex items-center justify-center rounded-xl transition-colors ${
            pathname === "/calendar" || pathname.startsWith("/calendar/")
              ? "bg-indigo-100 text-indigo-600"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          }`}
        >
          <CalendarDays className="h-5 w-5" />
        </Link>
        <NotificationsBell />

        <Link
          href="/operations/employees/me"
          className="flex items-center gap-2.5 p-1 rounded-xl transition-all hover:bg-slate-100 group"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 leading-none mb-0.5 group-hover:text-indigo-600 transition-colors">
              {user?.name || "User Account"}
            </p>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              {user?.organizationName || "Workspace"}
            </p>
          </div>

          <Avatar className="h-8 w-8 rounded-full border-2 border-white shadow-sm">
            <AvatarFallback className="bg-indigo-600 text-white text-xs font-bold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
