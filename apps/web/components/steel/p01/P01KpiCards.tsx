"use client";

import { Loader2, ClipboardList, Hourglass, PauseCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { SteelPlanSummary } from "@/services/steel.service";

interface Props {
  summary?: SteelPlanSummary;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

// Context here is derived directly from the current snapshot (share of
// total, zero-state messaging) — never a historical/time-series comparison,
// since the backend stores no such history for production plans.
export function P01KpiCards({ summary, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load plan summary." />
        </CardContent>
      </Card>
    );
  }

  const total = summary?.total ?? 0;
  const inProgress = summary?.byStatus["IN_PROGRESS"] ?? 0;
  const onHold = summary?.byStatus["ON_HOLD"] ?? 0;
  const released = summary?.byStatus["RELEASED"] ?? 0;

  const items = [
    {
      label: "Total Plans",
      value: total,
      icon: ClipboardList,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === 0 ? "No plans currently on hold" : `${pct(onHold, total)}% of total`,
    },
    {
      label: "Released",
      value: released,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(released, total) !== null ? `${pct(released, total)}% of total` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
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
        );
      })}
    </div>
  );
}
