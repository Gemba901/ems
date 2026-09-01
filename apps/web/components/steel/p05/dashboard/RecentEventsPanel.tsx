"use client";

import Link from "next/link";
import { Loader2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { HEAT_CYCLE_EVENT_LABELS, type MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  limit?: number;
}

const DEFAULT_MAX_EVENTS = 8;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

// Right-sidebar compact feed — real HeatCycleEvent rows from
// MeltingService.getDashboard (recentEvents), the operator-logged event log
// already backing P05-A08/A09 "Monitor Melt". No activity is synthesized;
// heats with no logged events simply contribute nothing to this feed.
export function RecentEventsPanel({ data, isLoading, isError, isFetching, onRetry, limit = DEFAULT_MAX_EVENTS }: Props) {
  const allEvents = data?.recentEvents ?? [];
  const events = allEvents.slice(0, limit);
  const hasMore = allEvents.length > limit;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-slate-500" />
          Recent Activity
        </CardTitle>
        {hasMore && (
          <Link href="/steel/p05/records" className="text-xs font-medium text-slate-500 hover:text-slate-700">
            View all
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load recent activity." />
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No events logged in this period.</p>
        ) : (
          <ul className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 text-xs border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/steel/p05/${e.meltingId}`} className="font-medium text-slate-800 hover:underline">
                    {HEAT_CYCLE_EVENT_LABELS[e.eventType]}
                  </Link>
                  <p className="text-[10px] text-slate-400 truncate">
                    {e.heatInProcessNumber}
                    {e.temperatureCelsius !== null ? ` · ${e.temperatureCelsius}°C` : ""}
                    {e.quantity !== null ? ` · ${e.quantity}${e.unit ?? ""}` : ""}
                    {e.recordedBy ? ` · ${e.recordedBy.firstName} ${e.recordedBy.lastName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400 whitespace-nowrap">{formatTime(e.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
