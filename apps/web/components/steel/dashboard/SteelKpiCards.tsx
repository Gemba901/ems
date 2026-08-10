"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Factory, ClipboardList, Flame, ShieldCheck, Truck, AlertTriangle, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { MaterialIntakeService } from "@/services/material-intake.service";

interface KpiItem {
  label: string;
  unit?: string;
  icon: React.ElementType;
  tone: string;
  value: number | null;
  isLoading: boolean;
  note?: string;
}

// No time-series/history is stored anywhere in the Steel schema — every
// summary and list endpoint returns a current snapshot only. So every KPI
// here is honestly "no trend data yet" rather than a computed comparison;
// this is not decorative, it's the real state of what the backend can
// support until historical snapshots exist.
export function SteelKpiCards() {
  const { accessToken } = useAuthStore();

  // Real — P01's existing /steel/plans/summary endpoint.
  const plansSummary = useQuery({
    queryKey: ["steel-plans-summary"],
    queryFn: () => SteelService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  // Real — reuses P03's existing paginated list endpoint, filtered to
  // ON_HOLD, and reads the total from its pagination metadata. No new
  // backend endpoint needed for this count.
  const stockAlerts = useQuery({
    queryKey: ["steel-intake-on-hold-count"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { status: "ON_HOLD", page: 1, limit: 1 }),
    enabled: !!accessToken,
  });

  const items: KpiItem[] = [
    {
      label: "Total Production",
      unit: "tonnes",
      icon: Factory,
      tone: "text-slate-400 bg-slate-100",
      value: null,
      isLoading: false,
      note: "Available once P05–P12 are built",
    },
    {
      label: "Orders in Progress",
      unit: "production plans",
      icon: ClipboardList,
      tone: "text-blue-700 bg-blue-50",
      value: plansSummary.data ? plansSummary.data.byStatus["IN_PROGRESS"] ?? 0 : null,
      isLoading: plansSummary.isLoading,
    },
    {
      label: "Heats in Progress",
      unit: "heats",
      icon: Flame,
      tone: "text-slate-400 bg-slate-100",
      value: null,
      isLoading: false,
      note: "Available once P05 is built",
    },
    {
      label: "Quality Pass Rate",
      unit: "%",
      icon: ShieldCheck,
      tone: "text-slate-400 bg-slate-100",
      value: null,
      isLoading: false,
      note: "Available once P10 is built",
    },
    {
      label: "On-Time Delivery",
      unit: "%",
      icon: Truck,
      tone: "text-slate-400 bg-slate-100",
      value: null,
      isLoading: false,
      note: "Available once P11 is built",
    },
    {
      label: "Stock Alerts",
      unit: "material holds",
      icon: AlertTriangle,
      tone: "text-red-700 bg-red-50",
      value: stockAlerts.data?.pagination.total ?? null,
      isLoading: stockAlerts.isLoading,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        const unavailable = item.value === null && !item.isLoading;
        return (
          <Card key={item.label}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.tone}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </div>

              {item.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-3xl font-bold leading-none ${unavailable ? "text-slate-300" : "text-slate-900"}`}>
                    {unavailable ? "—" : item.value}
                  </p>
                  {!unavailable && item.unit && (
                    <span className="text-xs text-slate-400">{item.unit}</span>
                  )}
                </div>
              )}

              <div className="inline-flex items-center gap-1.5 text-[11px] rounded-full bg-slate-50 px-2 py-1 w-fit">
                {unavailable ? (
                  <span className="text-slate-400">{item.note}</span>
                ) : (
                  <>
                    <Minus className="h-3 w-3 text-slate-300" />
                    <span className="text-slate-400">No trend data yet</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
