"use client";

import { Loader2, Package, Hourglass, PauseCircle, PackageCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { PaginatedMaterialIntakes } from "@/services/material-intake.service";

interface Props {
  data?: PaginatedMaterialIntakes;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

// P03 has no dedicated summary endpoint (unlike P01/P02), so these counts
// are derived from a single bounded fetch (see AGGREGATE_LIMIT in
// app/steel/p03/page.tsx) rather than adding a new backend endpoint.
// `total` itself is always exact (the backend's real COUNT, independent of
// the fetch limit) — only the per-status breakdown is capped to the fetched
// page, which is exact for any org whose intake volume is under the limit.
export function P03KpiCards({ data, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load material intakes." />
        </CardContent>
      </Card>
    );
  }

  const total = data?.pagination.total ?? 0;
  const rows = data?.data ?? [];
  const inProgress = rows.filter((r) => r.status === "IN_PROGRESS").length;
  const onHold = rows.filter((r) => r.status === "ON_HOLD").length;
  const released = rows.filter((r) => r.status === "RELEASED").length;

  const items = [
    {
      label: "Total Intakes",
      value: total,
      icon: Package,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All material intakes currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Intakes actively moving through gate, inspection, and storage.",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === 0 ? "No intakes currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Intakes paused, pending a re-decision on acceptance.",
    },
    {
      label: "Released",
      value: released,
      icon: PackageCheck,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(released, total) !== null ? `${pct(released, total)}% of total` : "—",
      tooltip: "Intakes that have completed release to stock.",
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
