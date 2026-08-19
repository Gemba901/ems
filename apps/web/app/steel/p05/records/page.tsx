"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { MeltingService } from "@/services/steel-melting.service";
import { P05KpiCards } from "@/components/steel/p05/P05KpiCards";
import { P05Filters, type P05FiltersState, DEFAULT_P05_FILTERS } from "@/components/steel/p05/P05Filters";
import { MeltingList } from "@/components/steel/p05/MeltingList";

// Full searchable/paginated melting record list — the raw operational
// record store. The P05 dashboard (/steel/p05) is the primary landing view;
// this page remains for exhaustive search/browse beyond the dashboard's
// bounded recent-heats view.
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
      <Link
        href="/steel/p05"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Melting Dashboard
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">All Melting Records</h1>
        <p className="text-sm text-slate-500">Search and browse every P05 melting record.</p>
      </div>

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
