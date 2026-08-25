"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Factory,
  Plus,
  Home,
  LayoutGrid,
  Truck,
  PackageSearch,
  Wrench,
  Flame,
  FlaskConical,
  Box,
  PackageCheck,
  Layers,
  BadgeCheck,
  Warehouse,
  Headset,
  Settings,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";

interface SteelSidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

const PROCESS_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
// Mirrors CONFIG_ADMIN_ROLES on the API — only these roles may administer
// Steel Configuration master data.
const CONFIG_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// Steel Processes nav — P01-P06 are live and link to their existing
// routes; P07-P12 have no backend/pages yet and render disabled.
const STEEL_NAV = [
  { code: "P01", name: "Production Planning", href: "/steel/p01", newHref: "/steel/p01/new", icon: LayoutGrid, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P02", name: "Sourcing & Procurement", href: "/steel/p02", newHref: "/steel/p02/new", icon: Truck, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P03", name: "Receiving & Inspection", href: "/steel/p03", newHref: "/steel/p03/new", icon: PackageSearch, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P04", name: "Charge Preparation", href: "/steel/p04", newHref: "/steel/p04/new", icon: Wrench, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P05", name: "Melting", href: "/steel/p05", icon: Flame, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P06", name: "Heat Approval", href: "/steel/p06", icon: FlaskConical, live: true, allowedRoles: PROCESS_ROLES },
  { code: "P07", name: "Casting", href: "/steel/p07", icon: Box, live: false, allowedRoles: PROCESS_ROLES },
  { code: "P08", name: "Billet Control", href: "/steel/p08", icon: PackageCheck, live: false, allowedRoles: PROCESS_ROLES },
  { code: "P09", name: "Rolling", href: "/steel/p09", icon: Layers, live: false, allowedRoles: PROCESS_ROLES },
  { code: "P10", name: "Quality Control", href: "/steel/p10", icon: BadgeCheck, live: false, allowedRoles: PROCESS_ROLES },
  { code: "P11", name: "Storage & Dispatch", href: "/steel/p11", icon: Warehouse, live: false, allowedRoles: PROCESS_ROLES },
  { code: "P12", name: "Customer Support", href: "/steel/p12", icon: Headset, live: false, allowedRoles: PROCESS_ROLES },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SteelSidebar({ open = false, onClose, collapsed = false, onToggle }: SteelSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  // On mobile (open=true) always show full sidebar regardless of collapsed state
  const isCollapsed = collapsed && !open;

  const userRole = user?.roleLevel;
  const filteredNav = STEEL_NAV.filter(
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
          fixed z-50 top-0 left-0 h-dvh flex flex-col bg-[#111827] border-r border-white/6
          transition-all duration-300 ease-in-out overflow-hidden w-64
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
          ${collapsed ? "lg:w-16" : "lg:w-64"}
        `}
      >
        {/* ── Header: toggle + brand ── */}
        <div className={`flex items-center h-14 border-b border-white/6 shrink-0 ${isCollapsed ? "justify-center" : "px-4 gap-3"}`}>

          <button
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white/70 transition-colors"
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>

          {!isCollapsed && (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-blue-600 rounded-lg">
                <Factory className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-bold text-white truncate leading-tight">
                  {user?.organizationName || "Acme Steel Ltd."}
                </span>
                <span className="text-[10px] font-medium text-white/30 uppercase tracking-widest">
                  Steel Manufacturing ERP
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Steel Home — the single home destination ── */}
        <div className={`px-2 pt-3 shrink-0 ${isCollapsed ? "flex justify-center" : ""}`}>
          {!isCollapsed && (
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 pb-1">
              Steel Home
            </p>
          )}
          <Link
            href="/steel"
            onClick={onClose}
            title={isCollapsed ? "Steel Home" : undefined}
            className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
              pathname === "/steel"
                ? "bg-white/8 text-white"
                : "text-white/40 hover:bg-white/4 hover:text-white/80"
            } ${isCollapsed ? "h-10 w-10 justify-center" : "h-9 w-full px-3 gap-2"}`}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Steel Home</span>}
          </Link>
        </div>

{/* ── New record CTA (context-aware: P01 vs P02 vs P03) ── */}
        <div className={`px-2 pt-2 pb-1 shrink-0 ${isCollapsed ? "flex justify-center" : ""}`}>
          <Link
            href={
              pathname.startsWith("/steel/p03") ? "/steel/p03/new"
                : pathname.startsWith("/steel/p02") ? "/steel/p02/new"
                  : "/steel/p01/new"
            }
            onClick={onClose}
            title={isCollapsed ? "New" : undefined}
            className={`flex items-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors ${
              isCollapsed ? "h-10 w-10 justify-center" : "h-10 w-full px-3 gap-2"
            }`}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!isCollapsed && (
              <span className="text-sm font-medium">
                {pathname.startsWith("/steel/p03") ? "New Material Intake"
                  : pathname.startsWith("/steel/p02") ? "New Sourcing Order"
                    : "New Production Plan"}
              </span>
            )}
          </Link>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5">
          {!isCollapsed && (
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 pb-2">
              Steel Processes
            </p>
          )}
          {filteredNav.map((item) => {
            if (!item.live) {
              return (
                <div
                  key={item.code}
                  title={isCollapsed ? `${item.code} — ${item.name} (not started)` : undefined}
                  className={`flex items-center rounded-xl text-sm font-medium text-white/15 cursor-not-allowed ${
                    isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0 text-white/15" />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 truncate">
                        {item.code} {item.name}
                      </span>
                      <span className="text-[9px] font-medium uppercase tracking-wide text-white/15 shrink-0">
                        Soon
                      </span>
                    </>
                  )}
                </div>
              );
            }

            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.code}
                href={item.href}
                onClick={onClose}
                title={isCollapsed ? `${item.code} — ${item.name}` : undefined}
                className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-white/8 text-white"
                    : "text-white/40 hover:bg-white/4 hover:text-white/80"
                } ${isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-white/30"}`} />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 truncate">
                      {item.code} {item.name}
                    </span>
                    {active && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Configuration (Steel Admin only) ── */}
        {userRole && CONFIG_ROLES.includes(userRole) && (
          <div className="px-2 pb-1 border-t border-white/6 pt-2 space-y-0.5">
            {!isCollapsed && (
              <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 pb-1">
                Administration
              </p>
            )}
            <Link
              href="/steel/config"
              onClick={onClose}
              title={isCollapsed ? "Steel Configuration" : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive(pathname, "/steel/config")
                  ? "bg-white/8 text-white"
                  : "text-white/40 hover:bg-white/4 hover:text-white/80"
              } ${isCollapsed ? "h-10 justify-center" : "gap-3 px-3 py-2.5"}`}
            >
              <Settings className={`h-4 w-4 shrink-0 ${isActive(pathname, "/steel/config") ? "text-white" : "text-white/30"}`} />
              {!isCollapsed && <span className="flex-1 truncate">Configuration</span>}
            </Link>
          </div>
        )}

        {/* ── Main App section ── */}
        <div className="px-2 pb-2 border-t border-white/6 pt-2 space-y-0.5">
          {!isCollapsed && (
            <p className="text-[10px] font-medium text-white/20 uppercase tracking-widest px-3 pb-2">
              Main App
            </p>
          )}
          <Link
            href="/"
            onClick={onClose}
            title={isCollapsed ? "Main App" : undefined}
            className={`flex items-center rounded-xl text-sm font-medium text-white/40 hover:bg-white/8 hover:text-white transition-all duration-150 ${
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
