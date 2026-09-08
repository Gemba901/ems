"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Hourglass, PauseCircle, PackageCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import {
  MaterialIntakeService,
  SteelIntakeStatus,
  INTAKE_STAGE_LABELS,
  INTAKE_STAGE_ORDER,
} from "@/services/material-intake.service";
import { ProcessHeader } from "@/components/steel/ProcessHeader";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import { MaterialIntakeList } from "@/components/steel/p03/MaterialIntakeList";
import { StageOverview } from "@/components/steel/p03/StageOverview";
import { QuickActions } from "@/components/steel/p03/QuickActions";
import { type P03FiltersState, DEFAULT_P03_FILTERS } from "@/components/steel/p03/P03Filters";

const STATUS_OPTIONS: SteelIntakeStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "REJECTED", "RELEASED", "CANCELLED"];

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

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

  const total = aggregateQuery.data?.pagination.total ?? 0;
  const rows = aggregateQuery.data?.data ?? [];
  const inProgress = rows.filter((r) => r.status === "IN_PROGRESS").length;
  const onHold = rows.filter((r) => r.status === "ON_HOLD").length;
  const released = rows.filter((r) => r.status === "RELEASED").length;

  const kpiItems: KpiItem[] = [
    {
      label: "Total Intakes",
      value: total,
      icon: Package,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
      tooltip: "All material intakes currently available to you.",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
      tooltip: "Intakes actively moving through gate, inspection, and storage.",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === 0 ? "No intakes currently on hold" : `${pct(onHold, total)}% of total`,
      tooltip: "Intakes paused, pending a re-decision on acceptance.",
    },
    {
      label: "Released",
      value: released,
      icon: PackageCheck,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(released, total) !== null ? `${pct(released, total)}% of total` : "—",
      tooltip: "Intakes that have completed release to stock.",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <ProcessHeader
        code="P03"
        action={
          <Link href="/steel/p03/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Material Intake
            </Button>
          </Link>
        }
      />

      <KpiCardRow
        items={kpiItems}
        isLoading={aggregateQuery.isPending}
        isError={aggregateQuery.isError}
        isFetching={aggregateQuery.isFetching}
        onRetry={() => aggregateQuery.refetch()}
        errorMessage="Could not load material intakes."
      />

      <FilterBar
        search={{ value: filters.search, onChange: (v) => updateFilters({ ...filters, search: v }), placeholder: "Search intake or vehicle number...", tooltip: "Search by material intake or vehicle/container number." }}
        selects={[
          {
            key: "stage",
            value: filters.stage,
            onChange: (v) => updateFilters({ ...filters, stage: v as P03FiltersState["stage"] }),
            options: INTAKE_STAGE_ORDER.map((s) => ({ value: s, label: INTAKE_STAGE_LABELS[s] })),
            placeholder: "All stages",
            tooltip: "Filter deliveries by where they currently are in the process.",
          },
          {
            key: "status",
            value: filters.status,
            onChange: (v) => updateFilters({ ...filters, status: v as P03FiltersState["status"] }),
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            placeholder: "All statuses",
            tooltip: "Filter by the intake's current status.",
          },
        ]}
        active={filtersActive}
        onClear={() => updateFilters(DEFAULT_P03_FILTERS)}
      />

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
