"use client";

import { Loader2, Scale } from "lucide-react";
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

// Scoped to completed heats with both charge and output data in the
// selected period — a simple input → output → loss readout, no Sankey.
export function MaterialOverviewPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const m = data?.materialOverview;
  const input = m?.totalInputTonnes ?? 0;
  const output = m?.totalOutputTonnes ?? 0;
  const outputPct = input > 0 ? Math.min(100, (output / input) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-slate-500" />
          Material / Loss Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load material overview." />
        ) : !m ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Total Input</p>
                <p className="text-2xl font-bold text-slate-900">{m.totalInputTonnes.toFixed(1)} T</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Output</p>
                <p className="text-2xl font-bold text-slate-900">{m.totalOutputTonnes.toFixed(1)} T</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Loss / Dross</p>
                <p className="text-2xl font-bold text-amber-600">{m.totalLossTonnes.toFixed(1)} T</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Average Yield</p>
                <p className="text-2xl font-bold text-emerald-600">{m.averageYieldPercent !== null ? `${m.averageYieldPercent.toFixed(1)}%` : "—"}</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-amber-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${outputPct}%` }} />
            </div>
            <p className="text-[11px] text-slate-400">Green = output, remainder = loss/dross, relative to total material input.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
