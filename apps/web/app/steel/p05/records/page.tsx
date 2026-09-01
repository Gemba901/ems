"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Layers, Hourglass, PauseCircle, Send } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { MeltingService, MELTING_STAGE_LABELS, MELTING_STAGE_ORDER, SteelMeltingStatus } from "@/services/steel-melting.service";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import { P05FiltersState, DEFAULT_P05_FILTERS } from "@/components/steel/p05/P05Filters";
import { MeltingList } from "@/components/steel/p05/MeltingList";

const STATUS_OPTIONS: SteelMeltingStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];

function pct(value: number | null, total: number | null) {
  if (value === null || total === null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

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

  // Same metrics/icons/tone/tooltip content P05KpiCards used to compute —
  // only the array construction moved inline, per the shared KpiCardRow API.
  const summary = summaryQuery.data;
  const total = summaryQuery.isPending || !summary ? null : summary.total;
  const inProgress = summaryQuery.isPending || !summary ? null : summary.byStatus.IN_PROGRESS ?? 0;
  const onHold = summaryQuery.isPending || !summary ? null : summary.byStatus.ON_HOLD ?? 0;
  const closed = summaryQuery.isPending || !summary ? null : summary.byStatus.CLOSED ?? 0;

  const kpiItems: KpiItem[] = [
    {
      label: "Total Melting Records",
      value: total ?? "—",
      icon: Layers,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All melting records currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress ?? "—",
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Heats actively moving through readiness, charging, and completion.",
    },
    {
      label: "On Hold",
      value: onHold ?? "—",
      icon: PauseCircle,
      tone: onHold !== null && onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === null ? "—" : onHold === 0 ? "No records currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Melting records paused and not currently progressing.",
    },
    {
      label: "Handed Over",
      value: closed ?? "—",
      icon: Send,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Heats that completed refining handover.",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
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

      <KpiCardRow
        items={kpiItems}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
        errorMessage="Could not load melting records."
      />

      <FilterBar
        search={{
          value: filters.search,
          onChange: (v) => updateFilters({ ...filters, search: v }),
          placeholder: "Search heat-in-process or Charge ID...",
          tooltip: "Search by heat-in-process number or Charge ID.",
        }}
        selects={[
          {
            key: "stage",
            value: filters.stage,
            onChange: (v) => updateFilters({ ...filters, stage: v as P05FiltersState["stage"] }),
            options: MELTING_STAGE_ORDER.map((s) => ({ value: s, label: MELTING_STAGE_LABELS[s] })),
            placeholder: "All stages",
            tooltip: "Filter records by where they currently are in the process.",
          },
          {
            key: "status",
            value: filters.status,
            onChange: (v) => updateFilters({ ...filters, status: v as P05FiltersState["status"] }),
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            placeholder: "All statuses",
            tooltip: "Filter by the record's current status.",
          },
        ]}
        active={filtersActive}
        onClear={() => updateFilters(DEFAULT_P05_FILTERS)}
      />

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
