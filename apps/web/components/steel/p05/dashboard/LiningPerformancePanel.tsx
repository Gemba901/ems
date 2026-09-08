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

// The campaign total and rows come from the server's real closed P05 outputs.
// No tonnage is inferred from recipe or material-input quantities.
export function LiningPerformancePanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
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
        ) : !data?.liningHistory.length ? (
          <p className="text-sm text-slate-400 text-center py-4">No completed heats with a recorded lining.</p>
        ) : (
          <div className="space-y-2.5">
            {data.liningHistory.map((history) => {
              const lining = liningById.get(history.liningId);
              return (
                <div key={history.liningId} className="border-b border-slate-100 last:border-0 pb-2.5 last:pb-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{lining?.code ?? "Lining campaign"}</p>
                      <p className="text-[10px] text-slate-400">{lining?.furnaceCode ?? "Furnace unavailable"} · Installed {lining ? new Date(lining.installedAt).toLocaleDateString() : "—"}</p>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{history.totalTonnesMelted.toFixed(1)} t total</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead><tr className="text-left text-slate-400 border-b border-slate-100"><th className="py-1 pr-2">Heat</th><th className="py-1 pr-2">Charge</th><th className="py-1 pr-2 text-right">Tonnes Melted</th><th className="py-1 text-right">Date</th></tr></thead>
                      <tbody>{history.heats.map((heat) => <tr key={heat.id} className="border-b border-slate-50 last:border-0"><td className="py-1 pr-2 font-medium text-slate-700">{heat.heatInProcessNumber}</td><td className="py-1 pr-2 text-slate-500">{heat.chargeNumber ?? "—"}</td><td className="py-1 pr-2 text-right text-slate-700">{heat.tonnesMelted?.toFixed(1) ?? "—"}</td><td className="py-1 text-right text-slate-500">{heat.date ? new Date(heat.date).toLocaleDateString() : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
