"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { NotificationsBell } from "./NotificationsBell";

interface HeaderProps {
  onMenuClick?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/hr": "People",
  "/hr/reports": "People Reports",
  "/operations": "Operations",
  "/operations/committees": "Committees",
  "/reports": "Reports",
  "/settings": "Settings",
  "/settings/members": "Members",
  "/settings/notifications": "Notifications",
  "/ems": "Employee Master Data",
  "/ems/employees": "Employee Master Data",
  "/ems/my-profile": "My Profile",
  "/sims": "Suggestions",
  "/sims/new": "New Suggestion",
  "/sims/my-suggestions": "My Suggestions",
  "/sims/queue": "Review Queue",
  "/sims/reviews": "Reviews",
  "/sims/analytics": "Analytics",
  "/sims/archived": "Archived",
  "/sims/settings": "SIMS Settings",
  "/calendar": "Calendar",
  "/department": "My Department",
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/operations/employees/me")) return "My Profile";
  if (pathname.startsWith("/operations/employees/")) return "Employee Profile";
  if (pathname.startsWith("/ems/employees/")) return "Employee Details";
  if (pathname.startsWith("/sims/")) return "Suggestions";
  if (pathname.startsWith("/admin/organizations/")) return "Organization";
  if (pathname.startsWith("/admin")) return "Admin Console";
  return "";
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const pageTitle = resolveTitle(pathname);

  return (
    <header className="flex h-16 items-center justify-between px-4 lg:px-8 bg-transparent">

      {/* Left: brand + page context */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 px-2 rounded-lg bg-indigo-600">
            <span className="text-[11px] font-black tracking-widest text-white leading-none">
              GEMBA
            </span>
          </div>
          {pageTitle && (
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-slate-300 text-sm select-none">/</span>
              <span className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{pageTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: calendar + notifications + user */}
      <div className="flex items-center gap-2 sm:gap-4">
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
