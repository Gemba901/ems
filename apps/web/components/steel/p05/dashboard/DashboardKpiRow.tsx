"use client";

import { Loader2, Flame, CheckCircle2, Percent, Clock, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function formatMinutes(min: number | null) {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The 5 numbers a furnace operator needs at a glance, all real fields from
// GET /steel/melting/dashboard's kpis object — no derived/invented figures.
export function DashboardKpiRow({ data, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load dashboard KPIs." />
        </CardContent>
      </Card>
    );
  }

  const kpis = isLoading || !data ? null : data.kpis;

  const items = [
    {
      label: "Active Heats",
      value: kpis?.activeHeats ?? null,
      icon: Flame,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Completed Heats",
      value: kpis?.completedHeats ?? null,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Average Yield %",
      value: kpis ? (kpis.averageYieldPercent !== null ? `${kpis.averageYieldPercent.toFixed(1)}%` : "—") : null,
      icon: Percent,
      tone: "text-indigo-700 bg-indigo-50",
    },
    {
      label: "Avg Cycle Time",
      value: kpis ? formatMinutes(kpis.averageCycleDurationMinutes) : null,
      icon: Clock,
      tone: "text-slate-700 bg-slate-100",
    },
    {
      label: "Material Processed",
      value: kpis ? `${kpis.totalMaterialInput.toFixed(1)} t` : null,
      icon: Package,
      tone: "text-amber-700 bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="flex flex-col gap-1.5 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{item.label}</p>
                <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${item.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
              ) : (
                <p className="text-xl font-bold leading-none text-slate-900">{item.value ?? "—"}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
