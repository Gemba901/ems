"use client";

import { Loader2, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { statusBadgeClass, statusToSemantic } from "@/lib/steelStatusColors";
import { stageLabel } from "@/components/steel/p05/shared";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// Per-furnace status cards — mirrors the mockup's "Furnace Status" row
// (EAF-01 ACTIVE / IDLE / MAINT cards). Backed entirely by
// MeltingDashboard.furnaceStatus, which the API already returns
// (furnace code/name/status, its active heat's heat number/stage/temperature,
// and its current lining) but no dashboard component previously rendered.
// "Tap Est." and a circular gauge from the mockup are omitted — melting
// doesn't record a tap-time estimate (that belongs to P06 tapping), and a
// gauge widget would just be a stylistic wrapper around the same
// temperatureCelsius value already shown as text, so it's skipped rather
// than reimplemented for no added information.
export function FurnaceStatusPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const furnaces = data?.furnaceStatus ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flame className="h-4 w-4 text-slate-500" />
          Furnace Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load furnace status." />
        ) : furnaces.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No furnaces configured.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {furnaces.map((f) => {
              const displayStatus = f.activeHeat ? "MELTING" : f.status;
              const semantic = statusToSemantic(displayStatus);
              return (
                <div
                  key={f.id}
                  className={
                    "rounded-lg border p-3 space-y-2 " +
                    (semantic === "ERROR" ? "border-red-200 bg-red-50/30" : semantic === "WARNING" ? "border-amber-200 bg-amber-50/30" : "border-slate-200")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{f.code}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${statusBadgeClass(displayStatus)}`}>
                      {displayStatus}
                    </span>
                  </div>

                  {f.activeHeat ? (
                    <div className="space-y-1">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Heat</p>
                        <p className="text-xs font-medium text-slate-800 truncate">{f.activeHeat.heatInProcessNumber}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Phase</p>
                        <p className="text-xs font-medium text-slate-800">{stageLabel(f.activeHeat.stage)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Current Temp.</p>
                        <p className="text-xs font-medium text-slate-800">
                          {f.activeHeat.temperatureCelsius !== null ? `${f.activeHeat.temperatureCelsius} °C` : "Not recorded"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Status</p>
                      <p className="text-xs font-medium text-slate-600">
                        {f.status === "READY" ? "Available" : f.status === "MAINTENANCE" ? "Maintenance" : f.status === "DOWN" ? "Down" : "Retired"}
                      </p>
                    </div>
                  )}

                  {f.lining && (
                    <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      Lining: {f.lining.heatsCompleted} heats{f.lining.condition ? ` · ${f.lining.condition}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
