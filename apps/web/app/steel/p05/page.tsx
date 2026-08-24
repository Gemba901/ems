"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Flame, List } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { MeltingService } from "@/services/steel-melting.service";
import { DashboardFilters, DEFAULT_DASHBOARD_FILTERS } from "@/components/steel/p05/dashboard/DashboardFilters";
import { DashboardKpiRow } from "@/components/steel/p05/dashboard/DashboardKpiRow";
import { FurnaceStatusPanel } from "@/components/steel/p05/dashboard/FurnaceStatusPanel";
import { HeatCycleTracker } from "@/components/steel/p05/dashboard/HeatCycleTracker";
import { FurnacePerformanceTable } from "@/components/steel/p05/dashboard/FurnacePerformanceTable";
import { RecentEventsPanel } from "@/components/steel/p05/dashboard/RecentEventsPanel";
import { LiningPerformancePanel } from "@/components/steel/p05/dashboard/LiningPerformancePanel";

// P05 production-control dashboard — one screen, answers "what's running,
// what's ready, are we on target, what needs attention" without scrolling
// through an A01-A09 activity checklist. The exhaustive searchable record
// list lives at /steel/p05/records; this page is the operational view,
// backed by the single aggregated GET /steel/melting/dashboard endpoint.
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
    <div className="p-4 md:p-6 space-y-3 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1.5">
          <Link href="/steel" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Steel Home
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Flame className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Melting Operations</h1>
              <p className="text-xs text-slate-500">P05 — Furnace & Heat Cycle Production Control</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DashboardFilters value={filters} onChange={setFilters} />
          <Link href="/steel/p05/records">
            <Button variant="outline" size="sm" className="gap-1.5">
              <List className="h-3.5 w-3.5" />
              All Records
            </Button>
          </Link>
        </div>
      </div>

      {/* Section 1 — KPI strip */}
      <DashboardKpiRow {...shared} />

      {/* Section 2 — per-furnace status (mockup's "Furnace Status" row) */}
      <FurnaceStatusPanel {...shared} />

      {/* Main grid — Heat Cycle Tracker dominant (9/12), right sidebar (3/12) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
        <div className="xl:col-span-9">
          <HeatCycleTracker {...shared} />
        </div>
        <div className="xl:col-span-3 space-y-3">
          <FurnacePerformanceTable {...shared} />
          <LiningPerformancePanel {...shared} />
          <RecentEventsPanel {...shared} limit={5} />
        </div>
      </div>
    </div>
  );
}
