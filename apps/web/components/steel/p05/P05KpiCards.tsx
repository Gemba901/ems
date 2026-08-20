"use client";

import { Loader2, Layers, Hourglass, PauseCircle, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { SteelMeltingSummary } from "@/services/steel-melting.service";

interface Props {
  data?: SteelMeltingSummary;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function pct(value: number | null, total: number | null) {
  if (value === null || total === null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

// Backed by the real GET /steel/melting/summary endpoint — these counts are
// the backend's exact totals, not a bounded client-side aggregation.
export function P05KpiCards({ data, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load melting records." />
        </CardContent>
      </Card>
    );
  }

  const total = isLoading || !data ? null : data.total;
  const inProgress = isLoading || !data ? null : data.byStatus.IN_PROGRESS ?? 0;
  const onHold = isLoading || !data ? null : data.byStatus.ON_HOLD ?? 0;
  const closed = isLoading || !data ? null : data.byStatus.CLOSED ?? 0;

  const items = [
    {
      label: "Total Melting Records",
      value: total,
      icon: Layers,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All melting records currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Heats actively moving through readiness, charging, and completion.",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold !== null && onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === null ? "—" : onHold === 0 ? "No records currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Melting records paused and not currently progressing.",
    },
    {
      label: "Handed Over",
      value: closed,
      icon: Send,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Heats that completed refining handover.",
    },
  ];

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.label}>
              <TooltipTrigger
                render={(triggerProps) => (
                  <Card {...triggerProps} className="cursor-default">
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                      </div>

                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                      ) : (
                        <p className="text-3xl font-bold leading-none text-slate-900">{item.value}</p>
                      )}

                      <p className="text-[11px] text-slate-400">{item.context}</p>
                    </CardContent>
                  </Card>
                )}
              />
              <TooltipContent>{item.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
