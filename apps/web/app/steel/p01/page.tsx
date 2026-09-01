"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Hourglass, PauseCircle, CheckCircle2, Plus, SlidersHorizontal, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  SteelService,
  SteelPlanStage,
  SteelPlanOverallStatus,
  OrderPriority,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/services/steel.service";
import { Button } from "@/components/ui/button";
import { ProcessHeader } from "@/components/steel/ProcessHeader";
import { KpiCardRow, type KpiItem } from "@/components/steel/KpiCardRow";
import { FilterBar } from "@/components/steel/FilterBar";
import { ProductionPlanList } from "@/components/steel/p01/ProductionPlanList";
import { StageOverview } from "@/components/steel/p01/StageOverview";
import { QuickActions } from "@/components/steel/p01/QuickActions";

const STATUS_OPTIONS: SteelPlanOverallStatus[] = ["DRAFT", "IN_PROGRESS", "ON_HOLD", "RELEASED", "CANCELLED"];
const PRIORITY_OPTIONS: OrderPriority[] = ["NORMAL", "URGENT", "EXPORT", "PROJECT", "STOCK_REPLENISHMENT"];

export interface P01FiltersState {
  search: string;
  stage: SteelPlanStage | "";
  status: SteelPlanOverallStatus | "";
  priority: OrderPriority | "";
  scheduledOnly: boolean;
  fromDate: string;
  toDate: string;
  sortBy: "createdAt" | "plannedStartDate";
  sortOrder: "asc" | "desc";
}

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";
const dateInputClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm";

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

const DEFAULT_FILTERS: P01FiltersState = {
  search: "",
  stage: "",
  status: "",
  priority: "",
  scheduledOnly: false,
  fromDate: "",
  toDate: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

export default function SteelPlansPage() {
  const { accessToken } = useAuthStore();
  const [filters, setFilters] = useState<P01FiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const dateRangeInvalid = !!(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate);

  const summaryQuery = useQuery({
    queryKey: ["steel-plans-summary"],
    queryFn: () => SteelService.getSummary(accessToken!),
    enabled: !!accessToken,
    retry: false,
  });

  const plansQuery = useQuery({
    queryKey: ["steel-plans", filters, page],
    queryFn: () =>
      SteelService.getAll(accessToken!, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        scheduledOnly: filters.scheduledOnly || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page,
        limit: 10,
      }),
    // Skip fetching an invalid range client-side rather than round-tripping
    // to the backend just to get the 400 it would correctly return.
    enabled: !!accessToken && !dateRangeInvalid,
  });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedActive = filters.priority !== "" || filters.scheduledOnly || filters.sortBy !== "createdAt";
  const filtersActive = advancedActive || !!filters.search || !!filters.stage || !!filters.status || !!filters.fromDate || !!filters.toDate;

  function updateFilters(next: P01FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function setFilter<K extends keyof P01FiltersState>(key: K, v: P01FiltersState[K]) {
    updateFilters({ ...filters, [key]: v });
  }

  function clearAdvanced() {
    updateFilters({ ...filters, priority: "", scheduledOnly: false, sortBy: "createdAt", sortOrder: "desc" });
  }

  function clearDates() {
    updateFilters({ ...filters, fromDate: "", toDate: "" });
  }

  function filterPendingApproval() {
    updateFilters({ ...DEFAULT_FILTERS, stage: "A11_PLAN_COMMUNICATED", status: "IN_PROGRESS" });
  }

  function filterOnHold() {
    updateFilters({ ...DEFAULT_FILTERS, status: "ON_HOLD" });
  }

  function viewSchedule() {
    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    updateFilters({
      ...DEFAULT_FILTERS,
      fromDate: today,
      toDate: in30Days,
      sortBy: "plannedStartDate",
      sortOrder: "asc",
    });
  }

  const summary = summaryQuery.data;
  const total = summary?.total ?? 0;
  const inProgress = summary?.byStatus["IN_PROGRESS"] ?? 0;
  const onHold = summary?.byStatus["ON_HOLD"] ?? 0;
  const released = summary?.byStatus["RELEASED"] ?? 0;

  // Context here is derived directly from the current snapshot (share of
  // total, zero-state messaging) — never a historical/time-series comparison,
  // since the backend stores no such history for production plans.
  const kpiItems: KpiItem[] = [
    {
      label: "Total Plans",
      value: total,
      icon: ClipboardList,
      tone: "text-blue-700 bg-blue-50",
      context: "Across all stages",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(inProgress, total) !== null ? `${pct(inProgress, total)}% of total` : "—",
    },
    {
      label: "On Hold",
      value: onHold,
      icon: PauseCircle,
      tone: onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: onHold === 0 ? "No plans currently on hold" : `${pct(onHold, total)}% of total`,
    },
    {
      label: "Released",
      value: released,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: pct(released, total) !== null ? `${pct(released, total)}% of total` : "—",
    },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <ProcessHeader
        code="P01"
        action={
          <Link href="/steel/p01/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Production Plan
            </Button>
          </Link>
        }
      />

      <KpiCardRow
        items={kpiItems}
        isLoading={summaryQuery.isLoading}
        isError={summaryQuery.isError}
        isFetching={summaryQuery.isFetching}
        onRetry={() => summaryQuery.refetch()}
        errorMessage="Could not load plan summary."
      />

      <div className="space-y-2">
        <FilterBar
          search={{
            value: filters.search,
            onChange: (v) => setFilter("search", v),
            placeholder: "Search by plan number, customer, or sales order...",
          }}
          selects={[
            {
              key: "stage",
              value: filters.stage,
              onChange: (v) => setFilter("stage", v as SteelPlanStage | ""),
              options: STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
              placeholder: "All stages",
            },
            {
              key: "status",
              value: filters.status,
              onChange: (v) => setFilter("status", v as SteelPlanOverallStatus | ""),
              options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
              placeholder: "All statuses",
            },
          ]}
          active={filtersActive}
          onClear={() => updateFilters(DEFAULT_FILTERS)}
          extra={
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-400">From</label>
                <input
                  type="date"
                  className={dateInputClass}
                  value={filters.fromDate}
                  max={filters.toDate || undefined}
                  onChange={(e) => setFilter("fromDate", e.target.value)}
                />
                <label className="text-xs text-slate-400">To</label>
                <input
                  type="date"
                  className={dateInputClass}
                  value={filters.toDate}
                  min={filters.fromDate || undefined}
                  onChange={(e) => setFilter("toDate", e.target.value)}
                />
                {(filters.fromDate || filters.toDate) && (
                  <button type="button" onClick={clearDates} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                variant={advancedActive ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setAdvancedOpen((o) => !o)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                More {advancedActive ? "•" : "+"}
              </Button>

              {advancedActive && (
                <button
                  type="button"
                  onClick={clearAdvanced}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear advanced
                </button>
              )}
            </>
          }
        />

        {dateRangeInvalid && (
          <p className="text-xs text-red-600">&quot;From&quot; date must not be after &quot;To&quot; date.</p>
        )}

        {advancedOpen && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Priority</label>
              <select
                className={selectClass}
                value={filters.priority}
                onChange={(e) => setFilter("priority", e.target.value as OrderPriority | "")}
              >
                <option value="">Any</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={filters.scheduledOnly}
                onChange={(e) => setFilter("scheduledOnly", e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Scheduled plans only
            </label>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Sort by</label>
              <select
                className={selectClass}
                value={filters.sortBy}
                onChange={(e) => setFilter("sortBy", e.target.value as "createdAt" | "plannedStartDate")}
              >
                <option value="createdAt">Created date</option>
                <option value="plannedStartDate">Production schedule date</option>
              </select>
              <select
                className={selectClass}
                value={filters.sortOrder}
                onChange={(e) => setFilter("sortOrder", e.target.value as "asc" | "desc")}
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] xl:grid-cols-[68%_32%] gap-4 items-start">
        <ProductionPlanList
          data={plansQuery.data}
          isLoading={plansQuery.isLoading}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          onRetry={() => plansQuery.refetch()}
          page={page}
          onPageChange={setPage}
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
            onFilterPendingApproval={filterPendingApproval}
            onFilterOnHold={filterOnHold}
            onViewSchedule={viewSchedule}
          />
        </div>
      </div>
    </div>
  );
}
