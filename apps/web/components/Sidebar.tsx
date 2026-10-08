"use client"

import { TenantImage } from "@/components/files/TenantImage";
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import {
  LayoutGrid,
  Settings,
  LogOut,
  ShieldCheck,
  Users,
  SlidersHorizontal,
  CalendarDays,
  Palmtree,
  UserCircle,
  Lightbulb,
  Ticket,
  Factory,
  Sparkles,
  Users2,
  ClipboardList,
  Briefcase
} from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import { AuthService } from "@/services/auth.service";
import { useToast } from "@/contexts/toast.context";
import { Role } from "@/types/role";
import { useOrgModules } from "@/hooks/useOrgModules";
import { ModuleSidebar, type SidebarNavItem } from "@/components/shell/ModuleSidebar";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrator",
  MANAGEMENT: "Management",
  HR: "Human Resources",
  HOD: "Head of Department",
  EMPLOYEE: "Employee",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  SUPER_ADMIN: { bg: "bg-purple-100", text: "text-purple-700" },
  ADMIN:       { bg: "bg-indigo-100", text: "text-indigo-700" },
  MANAGEMENT:  { bg: "bg-blue-100",   text: "text-blue-700"   },
  HR:          { bg: "bg-rose-100",   text: "text-rose-700"   },
  HOD:         { bg: "bg-amber-100",  text: "text-amber-700"  },
  EMPLOYEE:    { bg: "bg-slate-100",  text: "text-slate-600"  },
};

type MainNavItem = SidebarNavItem & { allowedRoles: Role[]; module?: string };

const NAV_ITEMS: MainNavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutGrid,
    exact: true,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "People",
    href: "/hr",
    icon: Users,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR],
  },
  {
    label: "Employee Master Data",
    href: "/ems",
    icon: ClipboardList,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR],
    module: "EMS",
  },
  {
    label: "Committees",
    href: "/operations/committees",
    icon: ShieldCheck,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT],
  },
  {
    label: "Tickets",
    href: "/tickets",
    icon: Ticket,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "Team Workspace",
    shortLabel: "Work",
    href: "/work",
    icon: Briefcase,
    module: "WORK",
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN],
  },
  {
    label: "Admin Console",
    shortLabel: "Admin",
    href: "/admin",
    icon: SlidersHorizontal,
    allowedRoles: [Role.SUPER_ADMIN],
  },
];

const EMPLOYEE_MODULE_ITEMS: (SidebarNavItem & { module: string })[] = [
  { label: "My Leave",    shortLabel: "Leave",       href: "/leave",               icon: Palmtree,     module: "LEAVE"    },
  { label: "Calendar",                               href: "/calendar",            icon: CalendarDays, module: "CALENDAR" },
  { label: "My Profile",  shortLabel: "Profile",     href: "/ems/my-profile",      icon: UserCircle,   module: "EMS"      },
  { label: "Suggestions", shortLabel: "Ideas",       href: "/sims/my-suggestions", icon: Lightbulb,    module: "SIMS"     },
];

export function Sidebar(props: SidebarProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { hasModule } = useOrgModules();
  const queryClient = useQueryClient();

  const { toast } = useToast();
  const handleLogout = async () => {
    try {
      await AuthService.logout();
      logout();
      queryClient.clear();
      router.push("/login");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to sign out. Please try again.", "error");
    }
  };

  const userRole = user?.roleLevel;
  const isEmployee = userRole === Role.EMPLOYEE;

  const filteredNav = NAV_ITEMS.filter(
    (item) => userRole && item.allowedRoles.includes(userRole) && (!item.module || hasModule(item.module)),
  );

  const employeeModules = isEmployee
    ? EMPLOYEE_MODULE_ITEMS.filter((item) => hasModule(item.module))
    : [];

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const roleLabel  = ROLE_LABELS[userRole ?? ""] ?? userRole ?? "";
  const roleColors = ROLE_COLORS[userRole ?? ""] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  const orgInitial = user?.organizationName?.[0]?.toUpperCase() ?? "G";

  const brand = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-indigo-500/20">
      {user?.organizationUrl ? (
        <TenantImage
          src={user.organizationUrl}
          alt={user.organizationName ?? ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-indigo-600 text-[11px] font-bold text-white">
          {orgInitial}
        </span>
      )}
    </span>
  );

  const footer = (collapsed: boolean) =>
    collapsed ? (
      <>
        <span
          className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white"
          title={user?.name || "User"}
        >
          {initials}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          className="flex w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
          <span className="text-[10.5px] font-medium leading-tight">Log out</span>
        </button>
      </>
    ) : (
      <div className="space-y-1 border-t border-slate-200 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-xs font-semibold leading-none text-slate-900">{user?.name || "User"}</span>
            <span className={`w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${roleColors.bg} ${roleColors.text}`}>
              {roleLabel}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          Log out
        </button>
      </div>
    );

  return (
    <ModuleSidebar
      {...props}
      id="main-sidebar"
      title={user?.organizationName || "Workspace"}
      subtitle="Workspace"
      homeHref="/"
      brand={brand}
      ariaLabel="Main navigation"
      dataTour="tour-sidebar"
      groups={[
        { name: "Platform", items: filteredNav },
        { name: "My Modules", items: employeeModules },
      ]}
      backLink={null}
      footer={footer}
    />
  );
}
