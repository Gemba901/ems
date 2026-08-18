"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { HeatApprovalService } from "@/services/steel-heat-approval.service";
import { P06Header } from "@/components/steel/p06/P06Header";
import { P06KpiCards } from "@/components/steel/p06/P06KpiCards";
import { P06Filters, type P06FiltersState, DEFAULT_P06_FILTERS } from "@/components/steel/p06/P06Filters";
import { HeatApprovalList } from "@/components/steel/p06/HeatApprovalList";

export default function HeatApprovalRecordsPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P06FiltersState>(DEFAULT_P06_FILTERS);
  const [page, setPage] = useState(1);

  const summaryQuery = useQuery({
    queryKey: ["heat-approval-summary"],
    queryFn: () => HeatApprovalService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const listQuery = useQuery({
    queryKey: ["heat-approvals", filters, page],
    queryFn: () =>
      HeatApprovalService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  function updateFilters(next: P06FiltersState) {
    setFilters(next);
    setPage(1);
  }

  const filtersActive = filters.search !== "" || filters.stage !== "" || filters.status !== "";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <P06Header />

      <P06KpiCards
        data={summaryQuery.data}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
      />

      <P06Filters value={filters} onChange={updateFilters} />

      <HeatApprovalList
        data={listQuery.data}
        isLoading={listQuery.isPending}
        isError={listQuery.isError}
        isFetching={listQuery.isFetching}
        onRetry={() => listQuery.refetch()}
        page={page}
        onPageChange={setPage}
        filtersActive={filtersActive}
        onClearFilters={() => updateFilters(DEFAULT_P06_FILTERS)}
      />
    </div>
  );
}
