"use client";

import { PauseCircle, Ban, CheckCircle2 } from "lucide-react";
import type { SteelMelting } from "@/services/steel-melting.service";

// Full-width banner shown directly under the sticky header for any
// non-active record status. DRAFT/IN_PROGRESS render nothing — the timeline
// itself is sufficient there. Replaces the old full-page CancelledState
// takeover and the ambiguous ON_HOLD padlock copy; sections are always
// rendered in full now (shared.tsx's SubStep just applies a status badge
// and reduced opacity for locked steps), and this banner explains *why*.
export function RecordStatusBanner({ melting }: { melting: SteelMelting }) {
  if (melting.status === "ON_HOLD") {
    return (
      <div className="flex items-center gap-2.5 bg-amber-50 border-b border-amber-200 px-4 md:px-8 py-2.5 text-sm text-amber-800">
        <PauseCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">Paused — no further steps until resumed.</span>
      </div>
    );
  }

  if (melting.status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2.5 bg-red-50 border-b border-red-200 px-4 md:px-8 py-2.5 text-sm text-red-800">
        <Ban className="h-4 w-4 shrink-0" />
        <span className="font-medium">This melting record was cancelled.</span>
      </div>
    );
  }

  if (melting.status === "CLOSED") {
    return (
      <div className="flex items-center gap-2.5 bg-emerald-50 border-b border-emerald-200 px-4 md:px-8 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Handed to refining — {new Date(melting.updatedAt).toLocaleString()}.
        </span>
      </div>
    );
  }

  return null;
}
