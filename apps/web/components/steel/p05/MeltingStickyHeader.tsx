"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SteelMelting } from "@/services/steel-melting.service";
import { statusBadgeClass } from "@/lib/steelStatusColors";

function formatElapsed(startedAt: string, now: number): string {
  const startedMs = new Date(startedAt).getTime();
  const minutes = Math.max(0, Math.floor((now - startedMs) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} hr${hours === 1 ? "" : "s"}${rem ? ` ${rem} min` : ""}`;
}

// Live "Melting started X ago" clock — computed client-side from
// meltingStartTime, ticking every minute. No backend change needed.
function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <Clock className="h-3.5 w-3.5" />
      Melting started {formatElapsed(startedAt, now)} ago
    </span>
  );
}

// Planned charge weight = sum of the P04 recipe snapshot fields captured on
// this melting record at creation time — the only real "planned tonnage"
// source (mirrors the backend's plannedChargeTonnes derivation used on the
// dashboard). Null when none of the four snapshot fields were captured.
function plannedTonnes(melting: SteelMelting): number | null {
  const { recipeScrapWeightSnapshot, recipeDriWeightSnapshot, recipeAlloyWeightSnapshot, recipeAdditiveWeightSnapshot } = melting;
  if (
    recipeScrapWeightSnapshot === null &&
    recipeDriWeightSnapshot === null &&
    recipeAlloyWeightSnapshot === null &&
    recipeAdditiveWeightSnapshot === null
  ) {
    return null;
  }
  return (
    (recipeScrapWeightSnapshot ?? 0) +
    (recipeDriWeightSnapshot ?? 0) +
    (recipeAlloyWeightSnapshot ?? 0) +
    (recipeAdditiveWeightSnapshot ?? 0)
  );
}

function HeaderStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium text-slate-700 truncate">{value ?? "—"}</p>
    </div>
  );
}

// Sticky top bar for the P05 single-page timeline: back link, heat number,
// status badge, furnace, a live elapsed-time clock once meltingStartTime is
// set (i.e. stage past A07), and — on a second row — the heat's key stats
// (grade, charge weight, melted, temperature). Status uses the semantic
// color tokens from lib/steelStatusColors.ts throughout, never a hardcoded
// one-off color (MELTING is an active/healthy state, mapped to INFO/blue,
// same as the dashboard's furnace panel and heat cycle tracker).
export function MeltingStickyHeader({ melting }: { melting: SteelMelting }) {
  const planned = plannedTonnes(melting);
  const temperature = melting.temperatureCelsius ?? melting.liquidTemperatureCelsius;

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Link
          href="/steel/p05"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Heats
        </Link>
        <span className="font-semibold text-slate-900">{melting.heatInProcessNumber}</span>
        <Badge className={statusBadgeClass(melting.status)}>{melting.status.replace(/_/g, " ")}</Badge>
        <span className="text-xs text-slate-500">
          {melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : melting.furnaceId ?? "No furnace set"}
        </span>
        {melting.meltingStartTime && <ElapsedClock startedAt={melting.meltingStartTime} />}
      </div>
      <div className="max-w-4xl mx-auto px-4 md:px-8 pb-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HeaderStat label="Grade" value={melting.chargePreparation.actualGrade} />
        <HeaderStat label="Charge Weight" value={planned !== null ? `${planned.toFixed(1)} t` : null} />
        <HeaderStat
          label="Melted"
          value={melting.outputWeightTonnes !== null ? `${melting.outputWeightTonnes.toFixed(1)} t` : melting.status === "CLOSED" ? null : "In progress"}
        />
        <HeaderStat label="Temperature" value={temperature !== null && temperature !== undefined ? `${temperature}°C` : null} />
      </div>
    </div>
  );
}
