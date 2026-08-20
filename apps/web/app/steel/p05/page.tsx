"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Flame, Plus, List } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { MeltingService } from "@/services/steel-melting.service";
import { DashboardFilters, DEFAULT_DASHBOARD_FILTERS } from "@/components/steel/p05/dashboard/DashboardFilters";
import { DashboardKpiRow } from "@/components/steel/p05/dashboard/DashboardKpiRow";
import { FurnaceStatusPanel } from "@/components/steel/p05/dashboard/FurnaceStatusPanel";
import { ActiveHeatsPanel } from "@/components/steel/p05/dashboard/ActiveHeatsPanel";
import { HeatPerformanceChart } from "@/components/steel/p05/dashboard/HeatPerformanceChart";
import { FurnacePerformanceTable } from "@/components/steel/p05/dashboard/FurnacePerformanceTable";
import { LiningStatusPanel } from "@/components/steel/p05/dashboard/LiningStatusPanel";
import { MaterialOverviewPanel } from "@/components/steel/p05/dashboard/MaterialOverviewPanel";
import { RecentHeatHistoryTable } from "@/components/steel/p05/dashboard/RecentHeatHistoryTable";
import { RecentEventsPanel } from "@/components/steel/p05/dashboard/RecentEventsPanel";

// P05 management/operations dashboard — the primary landing view for
// Melting. The exhaustive searchable record list lives at /steel/p05/records;
// this page is the at-a-glance operational view, backed by the single
// aggregated GET /steel/melting/dashboard endpoint.
export default function MeltingDashboardPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState(DEFAULT_DASHBOARD_FILTERS);

  const dashboardQuery = useQuery({
    queryKey: ["melting-dashboard", filters],
    queryFn: () =>
      MeltingService.getDashboard(accessToken!, {
        range: filters.range,
        furnaceId: filters.furnaceId || undefined,
      }),
    enabled: !!accessToken,
  });

  const shared = {
    data: dashboardQuery.data,
    isLoading: dashboardQuery.isPending,
    isError: dashboardQuery.isError,
    isFetching: dashboardQuery.isFetching,
    onRetry: () => dashboardQuery.refetch(),
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="space-y-3">
        <Link href="/steel" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Steel Home
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
              <Flame className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Melting Operations</h1>
              <p className="text-sm text-slate-500">P05 — Furnace & Heat Cycle Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/steel/p05/records">
              <Button variant="outline" className="gap-2">
                <List className="h-4 w-4" />
                All Records
              </Button>
            </Link>
            <Link href="/steel/p05/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Start New Heat
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <DashboardFilters value={filters} onChange={setFilters} />

      <DashboardKpiRow {...shared} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-4 items-start">
        <FurnaceStatusPanel {...shared} />
        <ActiveHeatsPanel {...shared} />
      </div>

      <HeatPerformanceChart {...shared} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <FurnacePerformanceTable {...shared} />
        <LiningStatusPanel {...shared} />
      </div>

      <MaterialOverviewPanel {...shared} />

      <RecentHeatHistoryTable {...shared} />

      <RecentEventsPanel {...shared} />
    </div>
  );
}
