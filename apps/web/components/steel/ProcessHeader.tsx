"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";

interface Props {
  /** Process code, e.g. "P01". Must exist in STEEL_PROCESSES. */
  code: string;
  /** Overrides STEEL_PROCESSES[code].shortName if given (rare — keeps process identity as the default). */
  title?: string;
  /** Overrides the default "P0X — {name}" subtitle line. */
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  /** Optional right-side slot — typically a "New X" CTA button. */
  action?: React.ReactNode;
}

/**
 * Canonical list-page header for every steel process (P01-P06). Icon,
 * color, name, and description all come from STEEL_PROCESSES — never
 * hardcoded per process — so the header can't drift out of sync with the
 * steel-module home dashboard the way the old P0XHeader.tsx copies had.
 */
export function ProcessHeader({ code, title, subtitle, backHref = "/steel", backLabel = "Back to Steel Home", action }: Props) {
  const process = STEEL_PROCESSES.find((p) => p.code === code);
  if (!process) return null;
  const Icon = process.icon;

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl ${process.color.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-5 w-5 ${process.color.text}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{title ?? process.shortName}</h1>
            <p className="text-sm text-slate-500">{code} — {process.name}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">{subtitle ?? process.description}</p>
          </div>
        </div>

        {action}
      </div>
    </div>
  );
}
