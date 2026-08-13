"use client";

import { Loader2, Package, Hourglass, FileCheck2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { SteelSourcingSummary } from "@/services/steel-sourcing.service";

interface Props {
  summary?: SteelSourcingSummary;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

// Context here is a share-of-total derived from the current snapshot, never
// a historical/time-series trend — the backend stores no such history for
// sourcing orders.
export function P02KpiCards({ summary, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load sourcing summary." />
        </CardContent>
      </Card>
    );
  }

  const total = summary?.total ?? 0;
  const inProgress = summary?.byStatus["IN_PROGRESS"] ?? 0;
  const poIssued = summary?.byStatus["PO_ISSUED"] ?? 0;
  const closed = summary?.byStatus["CLOSED"] ?? 0;

  const items = [
    {
      label: "Total Orders",
      value: total,
      icon: Package,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All sourcing orders currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Orders that are actively moving through the sourcing workflow.",
    },
    {
      label: "PO Issued",
      value: poIssued,
      icon: FileCheck2,
      tone: "text-indigo-700 bg-indigo-50",
      context: pct(poIssued, total) !== null ? `${pct(poIssued, total)}% of total` : "—",
      tooltip: "Orders where the purchase order has been issued.",
    },
    {
      label: "Closed",
      value: closed,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Sourcing orders that have completed the handover process.",
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
