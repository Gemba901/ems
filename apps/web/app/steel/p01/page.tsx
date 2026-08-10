"use client";

import { useRef, useState } from "react";
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
  sortBy: "createdAt",
  sortOrder: "desc",
};

export default function SteelPlansPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P01FiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);

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
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P01FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function scrollToList() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function filterPendingApproval() {
    updateFilters({ ...DEFAULT_FILTERS, stage: "A11_PLAN_COMMUNICATED", status: "IN_PROGRESS" });
    scrollToList();
  }

  function filterAttention() {
    updateFilters({ ...DEFAULT_FILTERS, status: "ON_HOLD" });
    scrollToList();
  }

  function viewSchedule() {
    updateFilters({ ...DEFAULT_FILTERS, scheduledOnly: true, sortBy: "plannedStartDate", sortOrder: "asc" });
    scrollToList();
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P01Header />

      <P01KpiCards summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      <StageOverview summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      <QuickActions
        summary={summaryQuery.data}
        onFilterPendingApproval={filterPendingApproval}
        onFilterAttention={filterAttention}
        onViewSchedule={viewSchedule}
      />

      <div ref={listRef} className="space-y-4 scroll-mt-4">
        <P01Filters value={filters} onChange={updateFilters} />

        <ProductionPlanList
          data={plansQuery.data}
          isLoading={plansQuery.isLoading}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          onRetry={() => plansQuery.refetch()}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
