"use client";

import { useMemo } from "react";
import { Loader2, Layers } from "lucide-react";
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

interface LiningGroup {
  liningCode: string;
  heats: number;
  avgYieldPercent: number | null;
  avgCycleMinutes: number | null;
}

function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Grouped entirely client-side from data.recentHeats (already returned by
// GET /steel/melting/dashboard) — no separate service call and no invented
// numbers. Heats with no liningRefId are excluded from the grouping since
// there is nothing to group them by.
function groupByLining(data?: MeltingDashboard): LiningGroup[] {
  if (!data) return [];
  const buckets = new Map<string, { yields: number[]; cycles: number[]; count: number }>();
  for (const h of data.recentHeats) {
    if (!h.liningRefId) continue;
    const bucket = buckets.get(h.liningRefId) ?? { yields: [], cycles: [], count: 0 };
    bucket.count += 1;
    if (h.yieldPercent !== null) bucket.yields.push(h.yieldPercent);
    const cycle = h.outputMeltTimeMinutes ?? h.cycleDurationMinutes;
    if (cycle !== null) bucket.cycles.push(cycle);
    buckets.set(h.liningRefId, bucket);
  }
  return Array.from(buckets.entries())
    .map(([liningCode, b]) => ({
      liningCode,
      heats: b.count,
      avgYieldPercent: b.yields.length ? b.yields.reduce((a, v) => a + v, 0) / b.yields.length : null,
      avgCycleMinutes: b.cycles.length ? b.cycles.reduce((a, v) => a + v, 0) / b.cycles.length : null,
    }))
    .sort((a, b) => b.heats - a.heats);
}

// Right-sidebar panel — per-lining heat count / avg yield / avg cycle time
// (derived client-side from recentHeats, as before), plus install date and
// thickness remaining looked up from data.liningStatus — real FurnaceLining
// master data the dashboard already returns (MeltingService.getDashboard ->
// furnaceStatus[].lining), not something computed here. Deliberately no
// "efficiency" score: FurnaceLining's schema comment is explicit that no
// such formula is defined by the business yet.
export function LiningPerformancePanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const groups = useMemo(() => groupByLining(data), [data]);
  const liningById = useMemo(() => new Map((data?.liningStatus ?? []).map((l) => [l.id, l])), [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-slate-500" />
          Lining Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load lining performance." />
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No completed heats with a recorded lining in this period.</p>
        ) : (
          <div className="space-y-2.5">
            {groups.map((g) => {
              const lining = liningById.get(g.liningCode);
              const label = lining
                ? `${lining.furnaceCode} · ${lining.code ?? `Installed ${new Date(lining.installedAt).toLocaleDateString()}`}`
                : g.liningCode;
              return (
                <div key={g.liningCode} className="flex items-center justify-between text-xs border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{label}</p>
                    <p className="text-[10px] text-slate-400">
                      {g.heats} heat{g.heats === 1 ? "" : "s"} · avg cycle {formatMinutes(g.avgCycleMinutes)}
                      {lining?.thicknessRemainingMm !== undefined && lining?.thicknessRemainingMm !== null
                        ? ` · ${lining.thicknessRemainingMm}mm remaining`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-slate-600 font-medium">
                    {g.avgYieldPercent !== null ? `${g.avgYieldPercent.toFixed(1)}% yield` : "No yield data"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
