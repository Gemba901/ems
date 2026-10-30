"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  ClipboardCheck,
  FileHeart,
  ListChecks,
} from "lucide-react";

const TABS = [
  {
    href: "/tpm/health-checkups",
    label: "Standards",
    icon: ListChecks,
    match: (path: string) =>
      path === "/tpm/health-checkups" ||
      path.startsWith("/tpm/health-checkups/standards"),
  },
  {
    href: "/tpm/health-checkups/schedule",
    label: "Schedule",
    icon: CalendarClock,
    match: (path: string) => path.startsWith("/tpm/health-checkups/schedule"),
  },
  {
    href: "/tpm/health-checkups/checkups",
    label: "Record results",
    icon: ClipboardCheck,
    match: (path: string) =>
      path.startsWith("/tpm/health-checkups/checkups") &&
      !path.includes("/report"),
  },
  {
    href: "/tpm/health-checkups/reports",
    label: "Health reports",
    icon: FileHeart,
    match: (path: string) => path.startsWith("/tpm/health-checkups/reports"),
  },
] as const;

export function HealthCheckupTabs() {
  const pathname = usePathname();
  return (
    <nav className="hc-tabs" aria-label="Health checkup sections">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const current = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
          >
            <Icon size={16} /> {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function HealthOutcomeBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status) return <span className="hc-badge progress">In progress</span>;
  const tone =
    status === "Healthy"
      ? "healthy"
      : status === "Needs Attention"
        ? "attention"
        : status === "Critical"
          ? "critical"
          : status === "Incomplete"
            ? "incomplete"
            : "progress";
  return <span className={`hc-badge ${tone}`}>{status}</span>;
}
