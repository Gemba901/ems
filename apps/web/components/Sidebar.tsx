"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  Settings,
  BarChart2,
  LogOut,
  ShieldCheck,
  Building2,
  Stethoscope,
  SlidersHorizontal,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import { AuthService } from "@/services/auth.service";
import { Role } from "@/types/role";

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

const NAV_ITEMS = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutGrid,
    exact: true,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    name: "HR",
    href: "/hr",
    icon: Stethoscope,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.HR],
  },
  {
    name: "Operations",
    href: "/operations",
    icon: Building2,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
  {
    name: "Committees",
    href: "/operations/committees",
    icon: ShieldCheck,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT],
  },
  {
    name: "Reports",
    href: "/reports",
    icon: BarChart2,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
  {
    name: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE],
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN],
  },
  {
    name: "Admin Console",
    href: "/admin",
    icon: SlidersHorizontal,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN],
  },
];

function isNavActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  if (href === "/operations" && pathname.startsWith("/operations/committees")) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ open = false, onClose, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = async () => {
    await AuthService.logout();
    logout();
    router.push("/login");
  };

  const userRole = user?.roleLevel;
  const filteredNav = NAV_ITEMS.filter(
    (item) => userRole && item.allowedRoles.includes(userRole as Role)
  );

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const roleLabel  = ROLE_LABELS[userRole ?? ""] ?? userRole ?? "";
  const roleColors = ROLE_COLORS[userRole ?? ""] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  const orgInitial = user?.organizationName?.[0]?.toUpperCase() ?? "G";

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed z-50 top-0 left-0 h-dvh flex flex-col bg-white border-r border-slate-200
          transition-all duration-300 ease-in-out overflow-hidden w-64
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          ${collapsed ? "md:w-16" : "md:w-64"}
        `}
      >
        {/* ── Header: toggle + brand ── */}
        <div className={`flex items-center h-14 border-b border-slate-100 shrink-0 ${collapsed ? "justify-center" : "px-4 gap-3"}`}>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>

          {!collapsed && (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-indigo-500/20">
                {user?.organizationUrl ? (
                  <img
                    src={user.organizationUrl}
                    alt={user.organizationName ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-bold text-white bg-indigo-600 h-full w-full flex items-center justify-center">
                    {orgInitial}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-bold text-slate-900 truncate leading-tight">
                  {user?.organizationName || "Workspace"}
                </span>
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                  Workspace
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5">
          {!collapsed && (
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-3 pb-2">
              Platform
            </p>
          )}
          {filteredNav.map((item) => {
            const active = isNavActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.name : undefined}
                className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                } ${collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-white/60" />}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── User card ── */}
        {collapsed ? (
          <div className="mx-2 mb-2 flex justify-center py-2">
            <div
              className="flex h-8 w-8 items-center justify-center bg-slate-800 rounded-lg text-white text-xs font-bold"
              title={user?.name || "User"}
            >
              {initials}
            </div>
          </div>
        ) : (
          <div className="mx-2 mb-2 rounded-xl border border-slate-100 bg-slate-50">
            <div className="flex items-center h-14 px-3 gap-2.5">
              <div className="flex shrink-0 h-8 w-8 items-center justify-center bg-slate-800 rounded-lg text-white text-xs font-bold">
                {initials}
              </div>
              <div className="min-w-0 flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-900 truncate leading-none">
                  {user?.name || "User"}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit leading-none ${roleColors.bg} ${roleColors.text}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Logout ── */}
        <div className="pb-3 px-2">
          <button
            onClick={handleLogout}
            title={collapsed ? "Log out" : undefined}
            className={`w-full flex items-center rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors ${
              collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
