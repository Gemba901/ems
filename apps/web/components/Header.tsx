"use client";

import { Button } from "@/components/ui/button";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { useOrgModules } from "@/hooks/useOrgModules";
import { NotificationsBell } from "./NotificationsBell";

interface HeaderProps {
  onMenuClick?: () => void;
  title?: string;
  menuId?: string;
  menuOpen?: boolean;
}

function BrandGear({ size = 18, teeth = 8 }: { size?: number; teeth?: number }) {
  const maskId = useId();
  const r = size / 2;
  const innerR = r * 0.72;
  const holeR = r * 0.28;
  const toothW = (2 * Math.PI * innerR) / (teeth * 2.5);
  const toothH = (r - innerR) * 1.15;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <mask id={maskId}>
        <rect width={size} height={size} fill="white" />
        <circle cx={r} cy={r} r={holeR} fill="black" />
      </mask>
      <g mask={`url(#${maskId})`} fill="currentColor">
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
  "/ems/onboarding": "Onboarding Imports",
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
  "/dwms": "Home",
  "/dwms/routine-work": "Routine Work",
  "/dwms/tasks": "Assigned Tasks",
  "/dwms/assignedTasks": "Assigned Tasks",
  "/dwms/approvalTasks": "Approvals",
  "/dwms/alerts": "Alerts",
  "/dwms/abnormalities": "Abnormalities",
  "/dwms/dashboard": "Reports",
  "/dwms/activities": "Activities",
  "/dwms/activities/ingestions": "Activity Import History",
  "/dwms/actions/new": "New Work",
  "/dwms/settings": "RTM Settings",
  "/docs/dwms": "Documentation",
  "/sga": "Small Group Activities",
  "/sga/all": "All SGAs",
  "/sga/new": "New SGA",
  "/sga/reports": "SGA Reports",
  "/docs/sga": "Documentation",
  "/kaizen": "Daily Gemba Kaizen",
  "/kaizen/all": "All Kaizens",
  "/kaizen/new": "New Kaizen",
  "/kaizen/reports": "Kaizen Reports",
  "/docs/kaizen": "Documentation",
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
  if (pathname.startsWith("/ems/onboarding/")) return "Import Details";
  if (pathname.startsWith("/leave/employees/")) return "Employee Leave Profile";
  if (pathname.startsWith("/dwms/alerts/")) return "Alert Details";
  if (pathname.startsWith("/docs/dwms/")) return "Documentation";
  if (pathname.startsWith("/docs/sga/")) return "Documentation";
  if (pathname.startsWith("/sga/")) return "SGA Details";
  if (pathname.startsWith("/docs/kaizen/")) return "Documentation";
  if (pathname.startsWith("/kaizen/")) return "Kaizen Details";
  if (pathname.startsWith("/dwms/activities/ingestions/")) return "Activity Import Details";
  if (pathname.startsWith("/dwms/")) return "Routine and Task Management";
  if (pathname.startsWith("/sims/")) return "Suggestions";
  if (pathname.startsWith("/tickets/")) return "Ticket Details";
  if (pathname.startsWith("/admin/organizations/")) return "Organization";
  if (pathname.startsWith("/admin")) return "Admin Console";
  return "";
}

export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-50 focus:rounded-lg focus:border focus:border-ring focus:bg-card focus:px-3 focus:py-2 focus:text-foreground"
    >
      Skip to main content
    </a>
  );
}

export function Header({ onMenuClick, menuId, menuOpen, title }: HeaderProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const { hasModule } = useOrgModules();

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const pageTitle = title ?? resolveTitle(pathname);

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
      className={`sticky top-0 z-30 flex h-14 min-w-0 items-center justify-between gap-2 border-b border-border/70 bg-muted/90 px-3 backdrop-blur-md transition-transform duration-300 will-change-transform focus-within:translate-y-0 motion-reduce:transition-none sm:px-4 lg:px-8 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      {/* Left: brand + page context */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick && (
          <Button variant="ghost" size="icon"
            className="lg:hidden p-2 -ml-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            onClick={onMenuClick}
            data-tour="tour-menu"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-controls={menuId}
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        <div className="flex min-w-0 items-center gap-2" title="Business Excellence EcoSystem">
          <div className="flex shrink-0 items-center justify-center text-primary">
            <BrandGear size={22} />
          </div>
          <span className="shrink-0 text-sm font-black leading-none tracking-tight text-foreground">
            BEES
          </span>
          {pageTitle && (
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground text-sm select-none">/</span>
              <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{pageTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: calendar + notifications + user */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-4">
        {hasModule("CALENDAR") && (
          <Link
            href="/calendar"
            title="My Calendar"
            aria-label="My Calendar"
            aria-current={pathname === "/calendar" ? "page" : undefined}
            className={`h-9 w-9 flex items-center justify-center rounded-xl transition-colors ${
              pathname === "/calendar" || pathname.startsWith("/calendar/")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-5 w-5" />
          </Link>
        )}
        <span data-tour="tour-notifications"><NotificationsBell /></span>

        <Link
          href="/operations/employees/me"
          aria-label="My profile"
          className="flex items-center gap-2.5 p-1 rounded-xl transition-all hover:bg-muted group"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-foreground leading-none mb-0.5 group-hover:text-primary transition-colors">
              {user?.name || "User Account"}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {user?.organizationName || "Workspace"}
            </p>
          </div>

          <Avatar className="h-8 w-8 rounded-full border-2 border-card shadow-sm">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
