"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HelpCircle,
  Target,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { LEX_AREAS } from "../lex-navigation";
import type { ReactNode } from "react";

const links = [
  ["Findings", "swot-findings", ClipboardList],
  ["Review", "review-findings", ClipboardCheck],
  ["Objectives", "objectives", Target],
  ["Dept. goals", "department-plans", Building2],
  ["Individuals", "team-individual-plans", Users],
  ["Results", "results", BarChart3],
] as const;

/** The approved programme rail is scoped to Area 03; shared areas retain their shell. */
export function PlanningProgrammeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const displayName = user?.name || "Gemba PMS";
  return (
    <div className="min-h-screen bg-[#f4f7fa] font-sans text-[#183452]">
      <aside
        className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-3 border-r border-[#dfe6f0] bg-white px-[7px] py-4 min-[651px]:flex"
        aria-label="Programme navigation"
      >
        <Link
          href="/"
          aria-label="Gemba PMS home"
          className="mb-[18px] grid size-10 place-items-center rounded-xl bg-[#52618a] text-[21px] font-extrabold text-white"
        >
          B
        </Link>
        <nav className="space-y-1">
          {links.map(([label, path, Icon]) => {
            const href = `/leadership-excellence/performance-planning/${path}`;
            const active = pathname === href;
            return (
              <Link
                href={href}
                key={path}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-[10px] px-[3px] py-2 text-[9px] ${active ? "bg-[#eef0ff] text-[#534abb]" : "text-[#74849d] hover:bg-slate-50"}`}
              >
                <Icon size={19} strokeWidth={1.7} />
                {label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="mt-auto flex min-h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-[10px] text-[9px] text-[#74849d] hover:bg-slate-50"
          onClick={() =>
            window.dispatchEvent(new Event("planning-programme-guide"))
          }
        >
          <HelpCircle size={22} />
          Guide
        </button>
      </aside>
      <div className="min-w-0 min-[651px]:ml-20">
        <header className="flex min-h-[70px] flex-wrap items-center justify-between gap-3 border-b border-[#dfe6f0] bg-white px-3.5 py-3 min-[651px]:h-[70px] min-[651px]:px-7 min-[651px]:py-0">
          <div className="text-[11px] text-[#718096] min-[651px]:text-[13px]">
            <Link href="/" className="font-semibold text-[#425273]">
              BEES
            </Link>
            <span className="mx-2">/</span>
            <Link href="/leadership-excellence">Leadership Excellence</Link>
            <span className="hidden sm:inline">
              <span className="mx-2">/</span>Performance Planning
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold">{displayName}</p>
              <p className="mt-0.5 text-[10px] text-[#718096]">
                {String(user?.roleLevel || "").replaceAll("_", " ")}
              </p>
            </div>
            <span className="hidden size-[33px] place-items-center rounded-full bg-[#eeeafd] text-xs font-bold text-[#6452b5] sm:grid">
              {displayName
                .split(" ")
                .map((word) => word[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>
        <nav
          className="flex h-[47px] gap-[25px] overflow-x-auto whitespace-nowrap border-b border-[#dfe6f0] bg-white px-3.5 min-[651px]:px-7"
          aria-label="BEES functional areas"
        >
          {LEX_AREAS.map((area) => (
            <Link
              href={area.href}
              key={area.id}
              className={`flex items-center border-b-2 px-0.5 text-[11px] ${area.id === "03" ? "border-[#6664b7] font-semibold text-[#5048ac]" : "border-transparent text-[#96a1b3] hover:text-slate-700"}`}
            >
              {area.id} ·{" "}
              {area.id === "03" ? "Performance Planning" : area.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto min-w-0 max-w-[1586px] px-3 pb-[45px] pt-4 min-[651px]:px-7 min-[651px]:pt-[25px]">
          {children}
        </main>
      </div>
    </div>
  );
}
