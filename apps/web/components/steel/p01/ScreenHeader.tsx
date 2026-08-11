"use client";

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  /** Optional extra content rendered at the end of the title row (e.g. a status badge). */
  rightContent?: React.ReactNode;
}

// Shared header for the P01 S1-S6 workflow screens: back link + icon badge
// + title/subtitle, matching the visual language established in S1.
export function ScreenHeader({
  icon: Icon, title, subtitle, backHref = "/steel/p01", backLabel = "Back to Production Planning", rightContent,
}: Props) {
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
          <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-blue-600" />
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
