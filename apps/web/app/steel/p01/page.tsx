"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { P01Header } from "@/components/steel/p01/P01Header";
import { P01KpiCards } from "@/components/steel/p01/P01KpiCards";
import { P01Filters, type P01FiltersState } from "@/components/steel/p01/P01Filters";
import { ProductionPlanList } from "@/components/steel/p01/ProductionPlanList";
import { StageOverview } from "@/components/steel/p01/StageOverview";
import { QuickActions } from "@/components/steel/p01/QuickActions";

const DEFAULT_FILTERS: P01FiltersState = {
  search: "",
  stage: "",
  status: "",
  priority: "",
  scheduledOnly: false,
  fromDate: "",
  toDate: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

export default function SteelPlansPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P01FiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const dateRangeInvalid = !!(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate);

  const summaryQuery = useQuery({
    queryKey: ["steel-plans-summary"],
    queryFn: () => SteelService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const plansQuery = useQuery({
    queryKey: ["steel-plans", filters, page],
    queryFn: () =>
      SteelService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        scheduledOnly: filters.scheduledOnly || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page,
        limit: 10,
      }),
    // Skip fetching an invalid range client-side rather than round-tripping
    // to the backend just to get the 400 it would correctly return.
    enabled: !!accessToken && !dateRangeInvalid,
  });

  function updateFilters(next: P01FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function filterPendingApproval() {
    updateFilters({ ...DEFAULT_FILTERS, stage: "A11_PLAN_COMMUNICATED", status: "IN_PROGRESS" });
  }

  function viewSchedule() {
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    updateFilters({
      ...DEFAULT_FILTERS,
      fromDate: today,
      toDate: in30Days,
      sortBy: "plannedStartDate",
      sortOrder: "asc",
    });
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P01Header />

      <P01KpiCards summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      <P01Filters value={filters} onChange={updateFilters} />

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] xl:grid-cols-[68%_32%] gap-4 items-start">
        <ProductionPlanList
          data={plansQuery.data}
          isLoading={plansQuery.isLoading}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          onRetry={() => plansQuery.refetch()}
          page={page}
          onPageChange={setPage}
        />

        <div className="space-y-4">
          <StageOverview summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
          <QuickActions
            summary={summaryQuery.data}
            filters={filters}
            onFilterPendingApproval={filterPendingApproval}
            onViewSchedule={viewSchedule}
          />
        </div>
      </div>
    </div>
  );
}
