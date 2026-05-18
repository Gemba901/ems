"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  Archive,
  Settings,
  HelpCircle,
  BarChart2,
  LogOut,
  ShieldCheck,
  Lightbulb,
  Building2,
  Stethoscope,
  SlidersHorizontal,
  CalendarDays,
} from "lucide-react";
import { useAuthStore } from "../store/auth.store";
import { Role } from "@/types/role";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
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
  // Committees is a sub-path of /operations — don't let /operations swallow it
  if (href === "/operations" && pathname.startsWith("/operations/committees")) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
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
  const orgInitial = user?.organizationName?.[0]?.toUpperCase() ?? "W";

  const fadeIn = `transition-opacity duration-300 whitespace-nowrap ${
    open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
  }`;

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
          fixed z-50 flex flex-col bg-white border-slate-200 transition-all duration-300 ease-in-out overflow-hidden group
          top-0 left-0 h-dvh w-64 border-r rounded-none shadow-xl
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:left-4 md:top-4 md:h-[calc(100dvh-2rem)] md:rounded-2xl md:border md:shadow-sm md:translate-x-0 md:w-16 md:hover:w-64
        `}
      >
        {/* Logo / workspace */}
        <div className="flex items-center h-16 px-3 shrink-0 overflow-hidden border-b border-slate-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl ml-0.5 border border-indigo-500/20">
            {user?.organizationUrl ? (
              <img
                src={user.organizationUrl}
                alt={user.organizationName ? `${user.organizationName} logo` : "Organization logo"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-white">{orgInitial}</span>
            )}
          </div>
          <div className={`ml-3 min-w-0 flex flex-col ${fadeIn}`}>
            <span className="text-sm font-bold text-slate-900 truncate leading-tight">
              {user?.organizationName || "Workspace"}
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
              Workspace
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto overflow-x-hidden min-h-0">
          {filteredNav.map((item) => {
            const active = isNavActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`flex items-center h-10 rounded-xl transition-all duration-150 ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <div className="flex shrink-0 w-10 items-center justify-center">
                  <item.icon className={`h-4.5 w-4.5 ${active ? "text-white" : "text-slate-400"}`} />
                </div>
                <span className={`ml-1 text-sm font-medium ${fadeIn}`}>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile card */}
        <div className="mx-2 mb-2 rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
          <div className="flex items-center h-14 px-1.5">
            <div className="flex shrink-0 w-9 h-9 items-center justify-center bg-slate-800 rounded-lg text-white text-xs font-bold">
              {initials}
            </div>
            <div className={`ml-2.5 min-w-0 flex flex-col gap-1 ${fadeIn}`}>
              <span className="text-xs font-semibold text-slate-900 truncate leading-none">
                {user?.name || "User"}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit leading-none ${roleColors.bg} ${roleColors.text}`}>
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="pb-3 px-2 flex flex-col gap-1">
          <Link
            href="/support"
            onClick={onClose}
            className="flex items-center h-10 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          >
            <div className="flex shrink-0 w-10 items-center justify-center">
              <HelpCircle className="h-4.5 w-4.5" />
            </div>
            <span className={`ml-1 text-sm font-medium ${fadeIn}`}>Support</span>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center h-10 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <div className="flex shrink-0 w-10 items-center justify-center">
              <LogOut className="h-4.5 w-4.5" />
            </div>
            <span className={`ml-1 text-sm font-medium ${fadeIn}`}>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
