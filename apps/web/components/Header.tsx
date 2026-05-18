"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { NotificationsBell } from "./NotificationsBell";

interface HeaderProps {
  onMenuClick?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/hr": "Human Resources",
  "/operations": "Operations",
  "/operations/committees": "Committees",
  "/reports": "Reports",
  "/inventory": "Inventory",
  "/settings": "Settings",
  "/settings/notifications": "Notifications",
  "/sims": "Suggestions",
  "/sims/new": "New Suggestion",
  "/sims/my-suggestions": "My Suggestions",
  "/sims/queue": "Review Queue",
  "/sims/reviews": "Reviews",
  "/sims/analytics": "Analytics",
  "/sims/archived": "Archived",
  "/sims/settings": "SIMS Settings",
  "/calendar": "Calendar",
  "/support": "Support",
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/operations/employees/me")) return "My Profile";
  if (pathname.startsWith("/operations/employees/")) return "Employee Profile";
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
    <header className="flex h-16 items-center justify-between px-4 md:px-8 bg-transparent">

      {/* Left: brand + page context */}
      <div className="flex items-center gap-3">
        <button
          className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* BEES brand mark */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 px-2 rounded-lg bg-indigo-600">
            <span className="text-[11px] font-black tracking-widest text-white leading-none">
              BEES
            </span>
          </div>
          {pageTitle && (
            <>
              <span className="text-slate-300 text-sm select-none">/</span>
              <span className="text-sm font-semibold text-slate-700">{pageTitle}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-4">
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
            <AvatarImage src="/placeholder.png" alt={user?.name || "User"} />
            <AvatarFallback className="bg-indigo-600 text-white text-xs font-bold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
