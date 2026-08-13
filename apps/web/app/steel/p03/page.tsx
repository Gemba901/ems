"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { P03Header } from "@/components/steel/p03/P03Header";
import { P03KpiCards } from "@/components/steel/p03/P03KpiCards";
import { P03Filters, type P03FiltersState, DEFAULT_P03_FILTERS } from "@/components/steel/p03/P03Filters";
import { MaterialIntakeList } from "@/components/steel/p03/MaterialIntakeList";
import { StageOverview } from "@/components/steel/p03/StageOverview";
import { QuickActions } from "@/components/steel/p03/QuickActions";

// P03 has no dedicated summary endpoint (unlike P01/P02) — KPI cards and
// the stage overview are derived from a single bounded fetch of the most
// recent intakes instead of adding a new backend endpoint. `pagination.total`
// on this response is still the real, exact count; only the per-status/
// per-screen breakdown is capped to AGGREGATE_LIMIT.
const AGGREGATE_LIMIT = 500;

export default function MaterialIntakesPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P03FiltersState>(DEFAULT_P03_FILTERS);
  const [page, setPage] = useState(1);

  const aggregateQuery = useQuery({
    queryKey: ["material-intakes-aggregate"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { limit: AGGREGATE_LIMIT }),
    enabled: !!accessToken,
  });

  const listQuery = useQuery({
    queryKey: ["material-intakes", filters, page],
    queryFn: () =>
      MaterialIntakeService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P03FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function filterAwaitingAcceptance() {
    updateFilters({ ...DEFAULT_P03_FILTERS, stage: "A09_CERTIFICATE_VERIFIED" });
  }

  function filterAwaitingRelease() {
    updateFilters({ ...DEFAULT_P03_FILTERS, stage: "A13_YARD_STORED" });
  }

  function filterOnHold() {
    updateFilters({ ...DEFAULT_P03_FILTERS, status: "ON_HOLD" });
  }

  const filtersActive = filters.search !== "" || filters.stage !== "" || filters.status !== "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P03Header />

      <P03KpiCards
        data={aggregateQuery.data}
        isLoading={aggregateQuery.isPending}
        isError={aggregateQuery.isError}
        isFetching={aggregateQuery.isFetching}
        onRetry={() => aggregateQuery.refetch()}
      />

      <P03Filters value={filters} onChange={updateFilters} />

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] xl:grid-cols-[68%_32%] gap-4 items-start">
        <MaterialIntakeList
          data={listQuery.data}
          isLoading={listQuery.isPending}
          isError={listQuery.isError}
          isFetching={listQuery.isFetching}
          onRetry={() => listQuery.refetch()}
          page={page}
          onPageChange={setPage}
          filtersActive={filtersActive}
          onClearFilters={() => updateFilters(DEFAULT_P03_FILTERS)}
        />

        <div className="space-y-4">
          <StageOverview
            data={aggregateQuery.data}
            isLoading={aggregateQuery.isPending}
            isError={aggregateQuery.isError}
            isFetching={aggregateQuery.isFetching}
            onRetry={() => aggregateQuery.refetch()}
          />
          <QuickActions
            data={aggregateQuery.data}
            isLoading={aggregateQuery.isPending}
            isError={aggregateQuery.isError}
            isFetching={aggregateQuery.isFetching}
            onRetry={() => aggregateQuery.refetch()}
            filters={filters}
            onFilterAwaitingAcceptance={filterAwaitingAcceptance}
            onFilterAwaitingRelease={filterAwaitingRelease}
            onFilterOnHold={filterOnHold}
          />
        </div>
      </div>
    </div>
  );
}
