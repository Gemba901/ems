"use client";

import { Loader2, BarChart3 } from "lucide-react";
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

function formatMinutes(min: number | null) {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// No hard-coded "underperforming" threshold exists in the business rules, so
// deviation is shown relative to the OTHER furnaces in this same result set
// (below the group average) rather than an arbitrary fixed number.
export function FurnacePerformanceTable({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const rows = data?.furnacePerformance ?? [];
  const yieldedRows = rows.filter((r) => r.averageYieldPercent !== null);
  const groupAvgYield = yieldedRows.length
    ? yieldedRows.reduce((s, r) => s + (r.averageYieldPercent ?? 0), 0) / yieldedRows.length
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-500" />
          Furnace Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load furnace performance." />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No furnaces set up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b">
                  <th className="py-1.5 pr-3">Furnace</th>
                  <th className="py-1.5 pr-3 text-right">Heats</th>
                  <th className="py-1.5 pr-3 text-right">Yield</th>
                  <th className="py-1.5 pr-3 text-right">Avg Cycle</th>
                  <th className="py-1.5 pr-3 text-right">Output</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const belowAverage =
                    groupAvgYield !== null && r.averageYieldPercent !== null && r.averageYieldPercent < groupAvgYield;
                  return (
                    <tr key={r.furnaceId} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-slate-900">{r.code} — {r.name}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{r.heatsCompleted}</td>
                      <td className={`py-2 pr-3 text-right font-medium ${belowAverage ? "text-amber-600" : "text-slate-900"}`}>
                        {r.averageYieldPercent !== null ? `${r.averageYieldPercent.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">{formatMinutes(r.averageCycleDurationMinutes)}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{r.totalOutputTonnes.toFixed(1)} T</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {groupAvgYield !== null && (
              <p className="text-[11px] text-slate-400 mt-2">Amber = below the {groupAvgYield.toFixed(1)}% group average for this period.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
