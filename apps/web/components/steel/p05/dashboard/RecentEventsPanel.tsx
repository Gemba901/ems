"use client";

import Link from "next/link";
import { Loader2, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { HEAT_CYCLE_EVENT_LABELS, type MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// Small, secondary section by design — most recent 20 events across all
// heats, not filtered to just exceptions, since HeatCycleEvent doesn't
// distinguish "notable" vs routine at the schema level.
export function RecentEventsPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const events = data?.recentEvents ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Radio className="h-4 w-4 text-slate-500" />
          Recent Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load recent events." />
        ) : events.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No events recorded yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs max-h-72 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <span className="text-slate-400 shrink-0 w-14">{new Date(e.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <Link href={`/steel/p05/${e.meltingId}`} className="font-medium text-slate-700 shrink-0 hover:underline">
                  {e.heatInProcessNumber}
                </Link>
                <span className="text-slate-600">{HEAT_CYCLE_EVENT_LABELS[e.eventType]}</span>
                {e.temperatureCelsius !== null && <span className="text-slate-500">{e.temperatureCelsius}°C</span>}
                {e.quantity !== null && <span className="text-slate-500">{e.quantity}{e.unit ? ` ${e.unit}` : ""}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
