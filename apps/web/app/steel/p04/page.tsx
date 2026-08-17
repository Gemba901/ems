"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { P04Header } from "@/components/steel/p04/P04Header";
import { P04KpiCards } from "@/components/steel/p04/P04KpiCards";
import { P04Filters, type P04FiltersState, DEFAULT_P04_FILTERS } from "@/components/steel/p04/P04Filters";
import { ChargePreparationList } from "@/components/steel/p04/ChargePreparationList";
import { StageOverview } from "@/components/steel/p04/StageOverview";
import { QuickActions } from "@/components/steel/p04/QuickActions";

export default function ChargePreparationsPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P04FiltersState>(DEFAULT_P04_FILTERS);
  const [page, setPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ["charge-preparations-summary"],
    queryFn: () => ChargePreparationService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const listQuery = useQuery({
    queryKey: ["charge-preparations", filters, page],
    queryFn: () =>
      ChargePreparationService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        planId: filters.planId || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P04FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function filterAwaitingVerification() {
    updateFilters({ ...DEFAULT_P04_FILTERS, stage: "A09_MATERIAL_STAGED" });
  }

  function filterAwaitingRelease() {
    updateFilters({ ...DEFAULT_P04_FILTERS, stage: "A10_VERIFICATION_DONE" });
  }

  function filterAwaitingHandover() {
    updateFilters({ ...DEFAULT_P04_FILTERS, stage: "A11_CHARGE_RELEASED" });
  }

  function filterOnHold() {
    updateFilters({ ...DEFAULT_P04_FILTERS, status: "ON_HOLD" });
  }

  const filtersActive = filters.search !== "" || filters.stage !== "" || filters.status !== "" || filters.planId !== "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P04Header />

      <P04KpiCards
        data={summaryQuery.data}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
      />

      <P04Filters value={filters} onChange={updateFilters} />

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] xl:grid-cols-[68%_32%] gap-4 items-start">
        <ChargePreparationList
          data={listQuery.data}
          isLoading={listQuery.isPending}
          isError={listQuery.isError}
          isFetching={listQuery.isFetching}
          onRetry={() => listQuery.refetch()}
          page={page}
          onPageChange={setPage}
          filtersActive={filtersActive}
          onClearFilters={() => updateFilters(DEFAULT_P04_FILTERS)}
        />

        <div className="space-y-4">
          <StageOverview
            data={summaryQuery.data}
            isLoading={summaryQuery.isPending}
            isError={summaryQuery.isError}
            isFetching={summaryQuery.isFetching}
            onRetry={() => summaryQuery.refetch()}
          />
          <QuickActions
            data={summaryQuery.data}
            isLoading={summaryQuery.isPending}
            isError={summaryQuery.isError}
            isFetching={summaryQuery.isFetching}
            onRetry={() => summaryQuery.refetch()}
            filters={filters}
            onFilterAwaitingVerification={filterAwaitingVerification}
            onFilterAwaitingRelease={filterAwaitingRelease}
            onFilterAwaitingHandover={filterAwaitingHandover}
            onFilterOnHold={filterOnHold}
          />
        </div>
      </div>
    </div>
  );
}
