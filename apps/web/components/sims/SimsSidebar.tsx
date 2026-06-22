"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Lightbulb,
  Plus,
  LayoutGrid,
  MessageSquareText,
  BarChart2,
  Archive,
  Settings,
  ArrowLeft,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

interface SimsSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const SIMS_NAV = [
  {
    name: "Overview",
    href: "/sims",
    icon: LayoutGrid,
    exact: true,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE],
  },
  {
    name: "My Suggestions",
    href: "/sims/my-suggestions",
    icon: Lightbulb,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE],
  },
  {
    name: "Review Queue",
    href: "/sims/queue",
    icon: ClipboardList,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
  {
    name: "Reviews",
    href: "/sims/reviews",
    icon: MessageSquareText,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
  {
    name: "Analytics",
    href: "/sims/analytics",
    icon: BarChart2,
    exact: false,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD],
  },
];

const FOOTER_NAV = [
  { name: "Closed",    href: "/sims/archived",  icon: Archive,   exact: false },
  { name: "Settings",  href: "/sims/settings",  icon: Settings,  exact: false },
];

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function SimsSidebar({ open = false, onClose, collapsed = false, onToggle }: SimsSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  // On mobile (open=true) always show full sidebar regardless of collapsed state
  const isCollapsed = collapsed && !open;

  const userRole = user?.roleLevel;
  const filteredNav = SIMS_NAV.filter(
    (item) => userRole && item.allowedRoles.includes(userRole)
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed z-50 top-0 left-0 h-dvh flex flex-col bg-white border-r border-slate-200
          transition-all duration-300 ease-in-out overflow-hidden w-64
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          ${collapsed ? "lg:w-16" : "lg:w-64"}
        `}
      >
        {/* ── Header: toggle + brand ── */}
        <div className={`flex items-center h-14 border-b border-slate-100 shrink-0 ${isCollapsed ? "justify-center" : "px-4 gap-3"}`}>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>

          {!isCollapsed && (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-blue-600 rounded-lg">
                <Lightbulb className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-bold text-slate-900 truncate leading-tight">
                  Suggestions & Ideas
                </span>
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                  SIMS
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── New Suggestion CTA ── */}
        <div className={`px-2 pt-3 pb-1 shrink-0 ${isCollapsed ? "flex justify-center" : ""}`}>
          <Link
            href="/sims/new"
            onClick={onClose}
            title={isCollapsed ? "New Suggestion" : undefined}
            className={`flex items-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors ${
              isCollapsed ? "h-10 w-10 justify-center" : "h-10 w-full px-3 gap-2"
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">New Suggestion</span>}
          </Link>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5">
          {!isCollapsed && (
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest px-3 pb-2">
              Platform
            </p>
          )}
          {filteredNav.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                } ${isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
                {!isCollapsed && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-blue-400" />}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Footer nav ── */}
        <div className="px-2 pb-2 border-t border-slate-100 pt-2 space-y-0.5">
          {FOOTER_NAV.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                } ${isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
                {!isCollapsed && <span className="flex-1">{item.name}</span>}
              </Link>
            );
          })}

          {/* Back to main app */}
          <Link
            href="/"
            onClick={onClose}
            title={isCollapsed ? "Main App" : undefined}
            className={`flex items-center rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-800 hover:text-white transition-all duration-150 ${
              isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"
            }`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="flex-1">Main App</span>}
          </Link>
        </div>
      </aside>
    </>
  );
}
