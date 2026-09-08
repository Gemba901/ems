"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Layers, Hourglass, PauseCircle, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth.store";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { SteelService } from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { ProcessHeader } from "@/components/steel/ProcessHeader";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import {
  type P04FiltersState,
  DEFAULT_P04_FILTERS,
} from "@/components/steel/p04/P04Filters";
import {
  SteelChargeStatus,
  CHARGE_STAGE_LABELS,
  CHARGE_STAGE_ORDER,
} from "@/services/steel-charge-preparation.service";
import { ChargePreparationList } from "@/components/steel/p04/ChargePreparationList";
import { StageOverview } from "@/components/steel/p04/StageOverview";
import { QuickActions } from "@/components/steel/p04/QuickActions";

const STATUS_OPTIONS: SteelChargeStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "CLOSED", "CANCELLED"];

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

  const plansQuery = useQuery({
    queryKey: ["steel-plans", "for-p04-filter"],
    queryFn: () => SteelService.getAll(accessToken!, { limit: 100 }),
    enabled: !!accessToken,
  });

  function pct(value: number | null, total: number | null) {
    if (value === null || total === null || total <= 0) return null;
    return Math.round((value / total) * 100);
  }

  // Distinguish "not loaded yet" (null) from "loaded and genuinely zero" —
  // the context line below must never claim e.g. "no preparations on hold"
  // while the summary query is still pending.
  const summaryData = summaryQuery.data;
  const summaryLoading = summaryQuery.isPending;
  const total = summaryLoading || !summaryData ? null : summaryData.total;
  const inProgress = summaryLoading || !summaryData ? null : summaryData.byStatus.IN_PROGRESS ?? 0;
  const onHold = summaryLoading || !summaryData ? null : summaryData.byStatus.ON_HOLD ?? 0;
  const closed = summaryLoading || !summaryData ? null : summaryData.byStatus.CLOSED ?? 0;

  // Unlike P02/P03, P04 already has a real backend summary endpoint
  // (GET /steel/charge-preparation/summary) — these counts are the backend's
  // exact totals, not a bounded client-side aggregation.
  const kpiItems: KpiItem[] = [
    {
      label: "Total Preparations",
      value: total,
      icon: Layers,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All charge preparations currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Preparations actively moving through material selection, prep, and verification.",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold !== null && onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === null ? "—" : onHold === 0 ? "No preparations currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Preparations paused and not currently progressing.",
    },
    {
      label: "Closed",
      value: closed,
      icon: PackageCheck,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Preparations that completed furnace handover.",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <ProcessHeader
        code="P04"
        action={
          <Link href="/steel/p04/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Charge Preparation
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
        errorMessage="Could not load charge preparations."
      />

      <FilterBar
        search={{
          value: filters.search,
          onChange: (v) => updateFilters({ ...filters, search: v }),
          placeholder: "Search preparation or Charge ID...",
          tooltip: "Search by preparation number or Charge ID.",
        }}
        selects={[
          {
            key: "stage",
            value: filters.stage,
            onChange: (v) => updateFilters({ ...filters, stage: v as P04FiltersState["stage"] }),
            options: CHARGE_STAGE_ORDER.map((s) => ({ value: s, label: CHARGE_STAGE_LABELS[s] })),
            placeholder: "All stages",
            tooltip: "Filter preparations by where they currently are in the process.",
          },
          {
            key: "status",
            value: filters.status,
            onChange: (v) => updateFilters({ ...filters, status: v as P04FiltersState["status"] }),
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            placeholder: "All statuses",
            tooltip: "Filter by the preparation's current status.",
          },
          {
            key: "planId",
            value: filters.planId,
            onChange: (v) => updateFilters({ ...filters, planId: v }),
            options: (plansQuery.data?.data ?? []).map((p) => ({ value: p.id, label: p.planNumber })),
            placeholder: "All production plans",
            tooltip: "Show only preparations for one production plan.",
          },
        ]}
        active={filtersActive}
        onClear={() => updateFilters(DEFAULT_P04_FILTERS)}
      />

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
