"use client";

import { Loader2, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
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
  const varianceTonnes = target !== null && actual !== null ? actual - target : null;
  const percentAchieved = kpis?.onTargetPercent ?? null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-slate-500" />
          Production Target
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            <Stat label="Target Tonnes" value={target !== null ? `${target.toFixed(1)}t` : "Not set"} sub="P04 recipe (planned charge)" />
            <Stat label="Actual Melted" value={actual !== null ? `${actual.toFixed(1)}t` : "—"} />
            <Stat label="% Achieved" value={percentAchieved !== null ? `${percentAchieved.toFixed(0)}%` : "Not set"} />
            <Stat
              label="Variance"
              value={varianceTonnes !== null ? `${varianceTonnes >= 0 ? "+" : ""}${varianceTonnes.toFixed(1)}t` : "—"}
            />
            <Stat label="Avg Cycle Time" value={kpis?.averageCycleDurationMinutes != null ? `${Math.round(kpis.averageCycleDurationMinutes)}m` : "—"} />
            <Stat label="Target Cycle Time" value="Not set" sub="No target-cycle-time field in the schema" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
