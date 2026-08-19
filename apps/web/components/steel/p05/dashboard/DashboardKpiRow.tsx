"use client";

import { Loader2, Flame, CheckCircle2, Gauge, Package, Clock } from "lucide-react";
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

// KPI values are exactly what MeltingService.getDashboard computes — no
// energy KPI is shown since no energy data exists yet.
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
      tone: "text-red-700 bg-red-50",
      context: "Currently in progress",
    },
    {
      label: "Completed Heats",
      value: kpis?.completedHeats ?? null,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: "In the selected period",
    },
    {
      label: "Average Yield",
      value: kpis?.averageYieldPercent !== null && kpis?.averageYieldPercent !== undefined ? `${kpis.averageYieldPercent.toFixed(1)}%` : "—",
      icon: Gauge,
      tone: "text-blue-700 bg-blue-50",
      context: "Completed heats with full data",
    },
    {
      label: "Material Processed",
      value: kpis ? `${kpis.totalMaterialInput.toFixed(1)}` : null,
      icon: Package,
      tone: "text-amber-700 bg-amber-50",
      context: "Charged this period (mixed units)",
    },
    {
      label: "Avg Cycle Time",
      value: kpis ? formatMinutes(kpis.averageCycleDurationMinutes) : null,
      icon: Clock,
      tone: "text-slate-700 bg-slate-100",
      context: "Start to refining handover",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                <p className="text-3xl font-bold leading-none text-slate-900">{item.value ?? "—"}</p>
              )}
              <p className="text-[11px] text-slate-400">{item.context}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
