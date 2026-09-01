"use client";

import { Loader2, Gauge } from "lucide-react";
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

function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Right-sidebar panel — per-furnace average yield %, the only real
// "efficiency" figure the backend computes (MeltingService.getDashboard ->
// furnacePerformance). There is no business-approved energy/tonne or
// utilization formula yet, so this deliberately shows yield + cycle time +
// heats completed only, never an invented composite "efficiency score".
export function FurnacePerformanceTable({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const rows = data?.furnacePerformance ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="h-4 w-4 text-slate-500" />
          Furnace Efficiency
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load furnace performance." />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No completed heats in this period.</p>
        ) : (
          <div className="space-y-2.5">
            {rows.map((f) => {
              const pct = f.averageYieldPercent !== null ? Math.max(0, Math.min(100, f.averageYieldPercent)) : null;
              return (
                <div key={f.furnaceId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{f.code}</span>
                    <span className="text-slate-500">
                      {pct !== null ? `${pct.toFixed(0)}% yield` : "No yield data"} · {f.heatsCompleted} heat{f.heatsCompleted === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct !== null && pct < 90 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Avg cycle {formatMinutes(f.averageCycleDurationMinutes)} · {f.totalOutputTonnes.toFixed(1)}t output
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
