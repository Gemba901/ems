"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";

export type ActivityTabKey = "activities" | "employees" | "ingestions";

const MASTER_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

export default function ActivityTabs({ active }: { active: ActivityTabKey }) {
  const role = String(useAuthStore((state) => state.user?.roleLevel) ?? "").toUpperCase();
  const tabs = [
    ...(MASTER_ROLES.has(role)
      ? ([{ key: "activities", label: "All Activities", href: "/dwms/activities" }] as const)
      : []),
    {
      key: "employees",
      label: "Employee Activities",
      href: "/dwms/activities/employees",
    },
    ...(MASTER_ROLES.has(role)
      ? ([
          {
            key: "ingestions",
            label: "Ingestion History",
            href: "/dwms/activities/ingestions",
          },
        ] as const)
      : []),
  ];

  return (
    <div className="flex gap-6 overflow-x-auto border-b border-border-app select-none">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`relative flex items-center whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition duration-150 ${
            active === tab.key
              ? "border-blue-500 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
