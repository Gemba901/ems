"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { P02Header } from "@/components/steel/p02/P02Header";
import { P02KpiCards } from "@/components/steel/p02/P02KpiCards";
import { P02Filters, type P02FiltersState, DEFAULT_P02_FILTERS } from "@/components/steel/p02/P02Filters";
import { SourcingOrderList } from "@/components/steel/p02/SourcingOrderList";
import { StageOverview } from "@/components/steel/p02/StageOverview";
import { QuickActions } from "@/components/steel/p02/QuickActions";

export default function SteelSourcingOrdersPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P02FiltersState>(DEFAULT_P02_FILTERS);
  const [page, setPage] = useState(1);

  // KPI cards and the order list use `isPending` (not `isLoading`) below —
  // `isLoading` is `isPending && isFetching`, which is false while these
  // queries are disabled (accessToken not yet hydrated from storage), so it
  // was letting "0" / "no orders" render before the query had even run once.
  const summaryQuery = useQuery({
    queryKey: ["steel-sourcing-summary"],
    queryFn: () => SteelSourcingService.getSummary(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const ordersQuery = useQuery({
    queryKey: ["steel-sourcing-orders", filters, page],
    queryFn: () =>
      SteelSourcingService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        materialType: filters.materialType || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P02FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function filterAwaitingPOApproval() {
    updateFilters({ ...DEFAULT_P02_FILTERS, stage: "A07_SPEC_CONFIRMED" });
  }

  function filterAwaitingHandoverClose() {
    updateFilters({ ...DEFAULT_P02_FILTERS, stage: "A11_INTAKE_INFORMED" });
  }

  function filterOnHold() {
    updateFilters({ ...DEFAULT_P02_FILTERS, status: "ON_HOLD" });
  }

  const filtersActive = filters.search !== "" || filters.stage !== "" || filters.status !== "" || filters.materialType !== "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P02Header />

      <P02KpiCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
      />

      <P02Filters value={filters} onChange={updateFilters} />

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] xl:grid-cols-[68%_32%] gap-4 items-start">
        <SourcingOrderList
          data={ordersQuery.data}
          isLoading={ordersQuery.isPending}
          isError={ordersQuery.isError}
          isFetching={ordersQuery.isFetching}
          onRetry={() => ordersQuery.refetch()}
          page={page}
          onPageChange={setPage}
          filtersActive={filtersActive}
          onClearFilters={() => updateFilters(DEFAULT_P02_FILTERS)}
        />

        <div className="space-y-4">
          <StageOverview
            summary={summaryQuery.data}
            isLoading={summaryQuery.isLoading}
            isError={summaryQuery.isError}
            isFetching={summaryQuery.isFetching}
            onRetry={() => summaryQuery.refetch()}
          />
          <QuickActions
            summary={summaryQuery.data}
            summaryIsError={summaryQuery.isError}
            summaryIsFetching={summaryQuery.isFetching}
            onRetrySummary={() => summaryQuery.refetch()}
            filters={filters}
            onFilterAwaitingPOApproval={filterAwaitingPOApproval}
            onFilterAwaitingHandoverClose={filterAwaitingHandoverClose}
            onFilterOnHold={filterOnHold}
          />
        </div>
      </div>
    </div>
  );
}
