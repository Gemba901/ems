"use client";

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  /** Optional extra content rendered at the end of the title row (e.g. a status badge). */
  rightContent?: React.ReactNode;
  /** Process code, e.g. "P01" — drives the icon badge color from STEEL_PROCESSES. Defaults to slate if omitted or unrecognized. */
  code?: string;
}

/**
 * Canonical detail/screen header for the P01-P06 S1-S6 workflow screens —
 * replaces 5 near-identical per-process copies. Same back-link + icon-badge
 * + title/subtitle shape as before; the only real change is that the icon
 * badge color now comes from STEEL_PROCESSES[code] instead of being
 * hardcoded blue in every copy.
 */
export function ScreenHeader({ icon: Icon, title, subtitle, backHref = "/steel", backLabel = "Back", rightContent, code }: Props) {
  const process = code ? STEEL_PROCESSES.find((p) => p.code === code) : undefined;
  const badgeBg = process?.color.bg ?? "bg-slate-100";
  const badgeText = process?.color.text ?? "text-slate-600";

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl ${badgeBg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${badgeText}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        {rightContent}
      </div>
    </div>
  );
}
