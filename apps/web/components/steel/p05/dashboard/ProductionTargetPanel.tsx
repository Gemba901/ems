"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
    </div>
  );
}

/**
 * Section 5 — compact target-vs-actual, no charts. Target tonnage comes
 * from the P04 recipe snapshot (the only real target source in the schema)
 * — "Not set" when nothing in range has one. Target Cycle Time / Time
 * Variance have no source anywhere in the schema (no field on Furnace,
 * SteelMelting, or any plan model) — shown as "Not set" rather than guessed.
 */
export function ProductionTargetPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load production target." />
        </CardContent>
      </Card>
    );
  }

  const kpis = isLoading || !data ? null : data.kpis;
  const target = kpis?.plannedChargeTonnes ?? null;
  const actual = kpis?.totalOutputTonnes ?? null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            <Stat label="Production Target" value={target !== null ? `${target.toFixed(1)} t` : "Unavailable"} />
            <Stat label="Melted" value={actual !== null ? `${actual.toFixed(1)} t` : "Unavailable"} />
            <Stat label="Remaining" value={target !== null && actual !== null ? `${Math.max(0, target - actual).toFixed(1)} t` : "Unavailable"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
