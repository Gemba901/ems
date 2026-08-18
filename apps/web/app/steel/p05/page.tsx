"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { MeltingService } from "@/services/steel-melting.service";
import { P05Header } from "@/components/steel/p05/P05Header";
import { P05KpiCards } from "@/components/steel/p05/P05KpiCards";
import { P05Filters, type P05FiltersState, DEFAULT_P05_FILTERS } from "@/components/steel/p05/P05Filters";
import { MeltingList } from "@/components/steel/p05/MeltingList";

export default function MeltingRecordsPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P05FiltersState>(DEFAULT_P05_FILTERS);
  const [page, setPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ["melting-summary"],
    queryFn: () => MeltingService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const listQuery = useQuery({
    queryKey: ["meltings", filters, page],
    queryFn: () =>
      MeltingService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P05FiltersState) {
    setFilters(next);
    setPage(1);
  }

  const filtersActive = filters.search !== "" || filters.stage !== "" || filters.status !== "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P05Header />

      <P05KpiCards
        data={summaryQuery.data}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
      />

      <P05Filters value={filters} onChange={updateFilters} />

      <MeltingList
        data={listQuery.data}
        isLoading={listQuery.isPending}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onRetry={() => listQuery.refetch()}
        page={page}
        onPageChange={setPage}
        filtersActive={filtersActive}
        onClearFilters={() => updateFilters(DEFAULT_P05_FILTERS)}
      />
    </div>
  );
}
