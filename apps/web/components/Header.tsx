"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { NotificationsBell } from "./NotificationsBell";

interface HeaderProps {
  onMenuClick?: () => void;
}

function BrandGear({ size = 18, teeth = 8 }: { size?: number; teeth?: number }) {
  const r = size / 2;
  const innerR = r * 0.72;
  const holeR = r * 0.28;
  const toothW = (2 * Math.PI * innerR) / (teeth * 2.5);
  const toothH = (r - innerR) * 1.15;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <mask id="brand-gear-mask">
        <rect width={size} height={size} fill="white" />
        <circle cx={r} cy={r} r={holeR} fill="black" />
      </mask>
      <g mask="url(#brand-gear-mask)" fill="currentColor">
        <circle cx={r} cy={r} r={innerR} />
        {Array.from({ length: teeth }).map((_, i) => (
          <rect
            key={i}
            x={r - toothW / 2}
            y={r - innerR - toothH + 2}
            width={toothW}
            height={toothH}
            rx={1}
            transform={`rotate(${(i * 360) / teeth}, ${r}, ${r})`}
          />
        ))}
      </g>
    </svg>
  );
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
  "/settings/tickets": "Tickets",
  "/tickets": "My Tickets",
  "/tickets/new": "Raise a Ticket",
  "/ems": "Employee Master Data",
  "/ems/employees": "Employee Master Data",
  "/ems/my-profile": "My Profile",
  "/sims": "Suggestions",
  "/sims/new": "New Suggestion",
  "/sims/my-suggestions": "My Suggestions",
  "/sims/queue": "Review Queue",
  "/sims/analytics": "Analytics",
  "/sims/committees": "Committee Report",
  "/sims/archived": "Archived",
  "/sims/settings": "SIMS Settings",
  "/calendar": "Calendar",
  "/department": "My Department",
  "/leave": "Leave Management",
  "/leave/apply": "Apply for Leave",
  "/leave/calendar": "Company Leave Calendar",
  "/leave/manage": "Leave Approval Workspace",
  "/leave/employees": "Employees",
  "/leave/policy": "Leave Policy",
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/operations/employees/me")) return "My Profile";
  if (pathname.startsWith("/operations/employees/")) return "Employee Profile";
  if (pathname.startsWith("/ems/employees/")) return "Employee Details";
  if (pathname.startsWith("/leave/employees/")) return "Employee Leave Profile";
  if (pathname.startsWith("/sims/")) return "Suggestions";
  if (pathname.startsWith("/tickets/")) return "Ticket Details";
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

  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      if (currentY < 64) {
        setVisible(true);
      } else if (delta > 8) {
        setVisible(false);
      } else if (delta < -8) {
        setVisible(true);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 flex h-14 items-center justify-between px-4 lg:px-8 bg-slate-50/85 backdrop-blur-md border-b border-slate-200/70 transition-transform duration-300 will-change-transform ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >

      {/* Left: brand + page context */}
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2" title="Business Excellence EcoSystem">
          <div className="flex shrink-0 items-center justify-center text-indigo-600">
            <BrandGear size={22} />
          </div>
          <span className="text-sm font-black tracking-tight text-slate-900 leading-none">
            BEES
          </span>
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
        <span data-tour="tour-notifications"><NotificationsBell /></span>

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
