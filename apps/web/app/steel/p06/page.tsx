"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Layers, Hourglass, PauseCircle, Send, Plus } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { HeatApprovalService, HEAT_APPROVAL_STAGE_LABELS, HEAT_APPROVAL_STAGE_ORDER, SteelHeatApprovalStatus } from "@/services/steel-heat-approval.service";
import { ProcessHeader } from "@/components/steel/ProcessHeader";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import { Button } from "@/components/ui/button";
import { P06FiltersState, DEFAULT_P06_FILTERS } from "@/components/steel/p06/P06Filters";
import { HeatApprovalList } from "@/components/steel/p06/HeatApprovalList";

const STATUS_OPTIONS: SteelHeatApprovalStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];

function pct(value: number | null, total: number | null) {
  if (value === null || total === null || total <= 0) return null;
  return Math.round((value / total) * 100);
}

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

  // Same metrics/icons/tone/tooltip content P06KpiCards used to compute —
  // only the array construction moved inline, per the shared KpiCardRow API.
  const summary = summaryQuery.data;
  const total = summaryQuery.isPending || !summary ? null : summary.total;
  const inProgress = summaryQuery.isPending || !summary ? null : summary.byStatus.IN_PROGRESS ?? 0;
  const onHold = summaryQuery.isPending || !summary ? null : summary.byStatus.ON_HOLD ?? 0;
  const closed = summaryQuery.isPending || !summary ? null : summary.byStatus.CLOSED ?? 0;

  const kpiItems: KpiItem[] = [
    {
      label: "Total Heat Approval Records",
      value: total ?? "—",
      icon: Layers,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All heat approval records currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress ?? "—",
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Heats actively moving through sampling, correction, and approval.",
    },
    {
      label: "On Hold",
      value: onHold ?? "—",
      icon: PauseCircle,
      tone: onHold !== null && onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === null ? "—" : onHold === 0 ? "No records currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Heat approval records paused and not currently progressing.",
    },
    {
      label: "Released to Casting",
      value: closed ?? "—",
      icon: Send,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Heats that completed release to casting.",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <ProcessHeader
        code="P06"
        action={
          <Link href="/steel/p06/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Heat Approval Record
            </Button>
          </Link>
        }
      />

      <KpiCardRow
        items={kpiItems}
        isLoading={summaryQuery.isPending}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
        errorMessage="Could not load heat approval records."
      />

      <FilterBar
        search={{
          value: filters.search,
          onChange: (v) => updateFilters({ ...filters, search: v }),
          placeholder: "Search approval number or heat number...",
          tooltip: "Search by approval number or heat number.",
        }}
        selects={[
          {
            key: "stage",
            value: filters.stage,
            onChange: (v) => updateFilters({ ...filters, stage: v as P06FiltersState["stage"] }),
            options: HEAT_APPROVAL_STAGE_ORDER.map((s) => ({ value: s, label: HEAT_APPROVAL_STAGE_LABELS[s] })),
            placeholder: "All stages",
            tooltip: "Filter records by where they currently are in the process.",
          },
          {
            key: "status",
            value: filters.status,
            onChange: (v) => updateFilters({ ...filters, status: v as P06FiltersState["status"] }),
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            placeholder: "All statuses",
            tooltip: "Filter by the record's current status.",
          },
        ]}
        active={filtersActive}
        onClear={() => updateFilters(DEFAULT_P06_FILTERS)}
      />

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
