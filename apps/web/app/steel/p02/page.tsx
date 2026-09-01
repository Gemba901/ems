"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Hourglass, FileCheck2, CheckCircle2, Plus } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { ProcessHeader } from "@/components/steel/ProcessHeader";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import { Button } from "@/components/ui/button";
import {
  SteelSourcingStatus,
  SteelMaterialType,
  SOURCING_STAGE_LABELS,
  SOURCING_STAGE_ORDER,
} from "@/services/steel-sourcing.service";
import { type P02FiltersState, DEFAULT_P02_FILTERS } from "@/components/steel/p02/P02Filters";
import { SourcingOrderList } from "@/components/steel/p02/SourcingOrderList";
import { StageOverview } from "@/components/steel/p02/StageOverview";
import { QuickActions } from "@/components/steel/p02/QuickActions";

const STATUS_OPTIONS: SteelSourcingStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "PO_ISSUED", "CLOSED", "CANCELLED"];
const MATERIAL_TYPE_OPTIONS: SteelMaterialType[] = [
  "SCRAP", "DRI", "BILLET", "ALLOY", "ADDITIVE", "FUEL", "REFRACTORY", "PACKING_MATERIAL", "OTHER",
];

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

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

  // Same metrics/icons/tone/tooltip content P02KpiCards used to compute —
  // only the array construction moved inline, per the shared KpiCardRow API.
  const summary = summaryQuery.data;
  const total = summary?.total ?? 0;
  const inProgress = summary?.byStatus["IN_PROGRESS"] ?? 0;
  const poIssued = summary?.byStatus["PO_ISSUED"] ?? 0;
  const closed = summary?.byStatus["CLOSED"] ?? 0;

  const kpiItems: KpiItem[] = [
    {
      label: "Total Orders",
      value: total,
      icon: Package,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All sourcing orders currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Orders that are actively moving through the sourcing workflow.",
    },
    {
      label: "PO Issued",
      value: poIssued,
      icon: FileCheck2,
      tone: "text-indigo-700 bg-indigo-50",
      context: pct(poIssued, total) !== null ? `${pct(poIssued, total)}% of total` : "—",
      tooltip: "Orders where the purchase order has been issued.",
    },
    {
      label: "Closed",
      value: closed,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(closed, total) !== null ? `${pct(closed, total)}% of total` : "—",
      tooltip: "Sourcing orders that have completed the handover process.",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <ProcessHeader
        code="P02"
        action={
          <Link href="/steel/p02/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Sourcing Order
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
        errorMessage="Could not load sourcing summary."
      />

      <FilterBar
        search={{
          value: filters.search,
          onChange: (v) => updateFilters({ ...filters, search: v }),
          placeholder: "Search sourcing orders or PO number...",
          tooltip: "Search by sourcing order or purchase order number.",
        }}
        selects={[
          {
            key: "stage",
            value: filters.stage,
            onChange: (v) => updateFilters({ ...filters, stage: v as P02FiltersState["stage"] }),
            options: SOURCING_STAGE_ORDER.map((s) => ({ value: s, label: SOURCING_STAGE_LABELS[s] })),
            placeholder: "All stages",
            tooltip: "Filter orders by their current workflow stage.",
          },
          {
            key: "status",
            value: filters.status,
            onChange: (v) => updateFilters({ ...filters, status: v as P02FiltersState["status"] }),
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            placeholder: "All statuses",
            tooltip: "Filter by the order's current status.",
          },
          {
            key: "materialType",
            value: filters.materialType,
            onChange: (v) => updateFilters({ ...filters, materialType: v as P02FiltersState["materialType"] }),
            options: MATERIAL_TYPE_OPTIONS.map((m) => ({ value: m, label: m.replace(/_/g, " ") })),
            placeholder: "All materials",
            tooltip: "Filter by the material type being sourced.",
          },
        ]}
        active={filtersActive}
        onClear={() => updateFilters(DEFAULT_P02_FILTERS)}
      />

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
