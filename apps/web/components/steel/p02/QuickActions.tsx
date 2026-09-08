"use client";

import { useState } from "react";
import { ClipboardCheck, ShieldCheck, PauseCircle, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelSourcingService, SOURCING_STAGE_LABELS, type SteelSourcingSummary } from "@/services/steel-sourcing.service";
import type { P02FiltersState } from "./P02Filters";

interface Props {
  summary?: SteelSourcingSummary;
  summaryIsError?: boolean;
  summaryIsFetching?: boolean;
  onRetrySummary?: () => void;
  filters: P02FiltersState;
  onFilterAwaitingPOApproval: () => void;
  onFilterAwaitingHandoverClose: () => void;
  onFilterOnHold: () => void;
}

const EXPORT_LIMIT = 500;

function exportToCSV(orders: Array<{
  sourcingNumber: string;
  status: string;
  stage: string;
  materialType: string | null;
  poNumber: string | null;
  supplier: { name: string } | null;
  plan: { planNumber: string; customerName: string | null } | null;
  createdAt: string;
}>) {
  const headers = ["Sourcing Order", "Status", "Stage", "Material Type", "PO Number", "Supplier", "Plan", "Customer", "Created"];
  const rows = orders.map((o) => [
    o.sourcingNumber,
    o.status,
    SOURCING_STAGE_LABELS[o.stage as keyof typeof SOURCING_STAGE_LABELS] ?? o.stage,
    o.materialType ?? "",
    o.poNumber ?? "",
    o.supplier?.name ?? "",
    o.plan?.planNumber ?? "",
    `"${(o.plan?.customerName ?? "").replace(/"/g, '""')}"`,
    new Date(o.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sourcing-orders.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Every action maps to real, backend-supported functionality:
// - Awaiting PO Approval reuses the existing stage filter (A07_SPEC_CONFIRMED
//   — specification confirmed, waiting on a Management/Admin role to issue
//   the purchase order).
// - Awaiting Handover Close reuses the existing stage filter
//   (A11_INTAKE_INFORMED — intake informed, waiting on a Management/Admin
//   role to close the handover).
// - On Hold Orders reuses the existing status filter (real count already
//   present on the summary).
// - Export Sourcing Orders fetches up to EXPORT_LIMIT orders matching the
//   current filters via the existing paginated list endpoint and writes a
//   real CSV from that response — no backend export endpoint exists, so
//   this is capped and client-side rather than claiming a server-side export.
export function QuickActions({
  summary, summaryIsError, summaryIsFetching, onRetrySummary, filters,
  onFilterAwaitingPOApproval, onFilterAwaitingHandoverClose, onFilterOnHold,
}: Props) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const awaitingPOCount = summary?.byStage["A07_SPEC_CONFIRMED"] ?? null;
  const awaitingHandoverCount = summary?.byStage["A11_INTAKE_INFORMED"] ?? null;
  const onHoldCount = summary?.byStatus["ON_HOLD"] ?? null;

  if (summaryIsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState
            onRetry={onRetrySummary ?? (() => {})}
            isRetrying={summaryIsFetching}
            message="Could not load quick action data."
          />
        </CardContent>
      </Card>
    );
  }

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const res = await SteelSourcingService.getAll(accessToken, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        materialType: filters.materialType || undefined,
        page: 1,
        limit: EXPORT_LIMIT,
      });
      if (res.data.length === 0) {
        toast("No sourcing orders match the current filters.", "error");
        return;
      }
      exportToCSV(res.data);
      const suffix = res.pagination.total > EXPORT_LIMIT ? ` (first ${EXPORT_LIMIT} of ${res.pagination.total})` : "";
      toast(`Exported ${res.data.length} order${res.data.length === 1 ? "" : "s"}${suffix}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const actions = [
    {
      label: "Awaiting PO Approval",
      description:
        awaitingPOCount === null
          ? "Orders with specification confirmed, awaiting purchase order approval."
          : `${awaitingPOCount} order${awaitingPOCount === 1 ? "" : "s"} awaiting purchase order approval.`,
      icon: ClipboardCheck,
      tone: "text-purple-700 bg-purple-50",
      onClick: onFilterAwaitingPOApproval,
    },
    {
      label: "Awaiting Handover Close",
      description:
        awaitingHandoverCount === null
          ? "Orders with intake informed, awaiting handover close approval."
          : `${awaitingHandoverCount} order${awaitingHandoverCount === 1 ? "" : "s"} awaiting handover close approval.`,
      icon: ShieldCheck,
      tone: "text-teal-700 bg-teal-50",
      onClick: onFilterAwaitingHandoverClose,
    },
    {
      label: "On Hold Orders",
      description:
        onHoldCount === null
          ? "Orders currently on hold."
          : onHoldCount === 0
            ? "No orders currently on hold."
            : `${onHoldCount} order${onHoldCount === 1 ? "" : "s"} on hold.`,
      icon: PauseCircle,
      tone: onHoldCount && onHoldCount > 0 ? "text-red-700 bg-red-50" : "text-slate-700 bg-slate-100",
      onClick: onFilterOnHold,
    },
    {
      label: "Export Sourcing Orders",
      description: exporting
        ? "Preparing CSV..."
        : `Download orders matching current filters (up to ${EXPORT_LIMIT}).`,
      icon: exporting ? Loader2 : Download,
      iconClassName: exporting ? "animate-spin" : "",
      tone: "text-slate-700 bg-slate-100",
      onClick: handleExport,
      disabled: exporting,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={"disabled" in action ? action.disabled : false}
                className="w-full flex items-start gap-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm px-3 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${action.tone}`}>
                  <Icon className={`h-4.5 w-4.5 ${action.iconClassName ?? ""}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="text-xs text-slate-500 leading-snug">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
