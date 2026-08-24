"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Hourglass, CheckCircle2, XCircle, FlaskConical, Plus, Info } from "lucide-react";
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

  // Maps to the "Heat Approval Dashboard" mockup's 4-card KPI row. Every
  // number traces to a real field: awaiting-approval and total come from
  // byStatus/total (already returned by getSummary); approvedToday,
  // rejectedToday, and chemistryCompliance are real aggregates added to
  // getSummary() in heat-approval.service.ts — see that function's comments
  // for exactly which status/timestamp/field each one is computed from.
  // There is no distinct "rejected" status in the backend — CANCELLED is
  // the closest real terminal state, so "Rejected Today" is labeled with a
  // tooltip clarifying that mapping rather than inventing a new status.
  const summary = summaryQuery.data;
  const total = summaryQuery.isPending || !summary ? null : summary.total;
  const awaitingApproval =
    summaryQuery.isPending || !summary ? null : (summary.byStatus.DRAFT ?? 0) + (summary.byStatus.IN_PROGRESS ?? 0);
  const approvedToday = summaryQuery.isPending || !summary ? null : summary.approvedToday;
  const rejectedToday = summaryQuery.isPending || !summary ? null : summary.rejectedToday;
  const compliancePct = summaryQuery.isPending || !summary ? null : summary.chemistryCompliance.pct;

  const kpiItems: KpiItem[] = [
    {
      label: "Heats Awaiting Approval",
      value: awaitingApproval ?? "—",
      icon: Hourglass,
      tone: "text-amber-700 bg-amber-50",
      context: pct(awaitingApproval, total) !== null ? `${pct(awaitingApproval, total)}% of total` : "—",
      tooltip: "Heat approval records still in DRAFT or IN_PROGRESS — not yet released to casting, cancelled, or on hold.",
    },
    {
      label: "Heats Approved Today",
      value: approvedToday ?? "—",
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50",
      context: "Released to casting today",
      tooltip: "Records that reached CLOSED (released to casting) today. There is no separate \"approved\" status — approval happens at A09 and release to casting is the terminal step that follows it.",
    },
    {
      label: "Heats Rejected Today",
      value: rejectedToday ?? "—",
      icon: XCircle,
      tone: rejectedToday !== null && rejectedToday > 0 ? "text-red-700 bg-red-50" : "text-slate-400 bg-slate-100",
      context: "Cancelled today",
      tooltip: "Records set to CANCELLED today — the closest real status to \"rejected\"; this workflow has no distinct REJECTED state.",
    },
    {
      label: "Avg. Chemistry Compliance",
      value: compliancePct !== null && compliancePct !== undefined ? `${compliancePct}%` : "—",
      icon: FlaskConical,
      tone: "text-blue-700 bg-blue-50",
      context:
        summary && summary.chemistryCompliance.evaluated > 0
          ? `${summary.chemistryCompliance.compliant} of ${summary.chemistryCompliance.evaluated} evaluated`
          : "No chemistry comparisons recorded yet",
      tooltip: "Share of records where the compared chemistry matched the required grade (P06-A03), across all records where that comparison has been recorded.",
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

      {/*
        Mockup screen 1 also shows a "Chemistry Compliance Trend" line chart
        and a "Compliance by Grade" donut. Deliberately omitted: the backend
        has no comparison timestamp to bucket a trend by day (only a
        per-record updatedAt that changes on every activity, not just A03),
        and no deviation-magnitude data to split into
        compliant/minor-deviation/major-deviation buckets — only the
        boolean chemistryMatchesGrade. Building either chart would mean
        fabricating data, which isn't allowed here.
      */}

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          Select a heat from the queue to review details and approve or reject.
        </p>
      </div>
    </div>
  );
}
