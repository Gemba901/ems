"use client";

import Link from "next/link";
import { Loader2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { MELTING_STAGE_LABELS, type MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function formatDuration(startIso: string) {
  const minutes = Math.max(0, (Date.now() - new Date(startIso).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// One of the most prominent sections — clicking a row opens the existing
// P05 [id] workflow router, which resolves to whichever S1/S2/S3 screen the
// heat's current stage belongs to. No duplicate detail page is created.
export function ActiveHeatsPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Active Heats
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load active heats." />
        ) : !data || data.activeHeats.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No heats currently active.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b">
                  <th className="py-1.5 pr-3">Heat</th>
                  <th className="py-1.5 pr-3">Furnace</th>
                  <th className="py-1.5 pr-3">Duration</th>
                  <th className="py-1.5 pr-3 text-right">Temp</th>
                  <th className="py-1.5 pr-3 text-right">Input</th>
                  <th className="py-1.5 pr-3">Stage</th>
                </tr>
              </thead>
              <tbody>
                {data.activeHeats.map((h) => (
                  <tr key={h.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/steel/p05/${h.id}`} className="font-semibold text-slate-900 hover:underline">
                        {h.heatInProcessNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{h.furnace?.code ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatDuration(h.startedAt)}</td>
                    <td className="py-2 pr-3 text-right font-medium text-slate-900">
                      {h.temperatureCelsius !== null ? `${h.temperatureCelsius}°C` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600">{h.materialInput}</td>
                    <td className="py-2 pr-3">
                      <Badge className="bg-blue-50 text-blue-700">{MELTING_STAGE_LABELS[h.stage]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
