"use client";

import { useState } from "react";
import { ClipboardCheck, ShieldCheck, PauseCircle, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { MaterialIntakeService, INTAKE_STAGE_LABELS, type PaginatedMaterialIntakes } from "@/services/material-intake.service";
import type { P03FiltersState } from "./P03Filters";

interface Props {
  data?: PaginatedMaterialIntakes;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  filters: P03FiltersState;
  onFilterAwaitingAcceptance: () => void;
  onFilterAwaitingRelease: () => void;
  onFilterOnHold: () => void;
}

const EXPORT_LIMIT = 500;

function exportToCSV(intakes: Array<{
  intakeNumber: string;
  status: string;
  stage: string;
  materialType: string | null;
  vehicleNumber: string;
  netWeightTonnes: number | null;
  sourcingOrder: { sourcingNumber: string } | null;
  createdAt: string;
}>) {
  const headers = ["Intake Number", "Status", "Stage", "Material Type", "Vehicle", "Net Weight (t)", "Sourcing Order", "Created"];
  const rows = intakes.map((i) => [
    i.intakeNumber,
    i.status,
    INTAKE_STAGE_LABELS[i.stage as keyof typeof INTAKE_STAGE_LABELS] ?? i.stage,
    i.materialType ?? "",
    i.vehicleNumber,
    i.netWeightTonnes ?? "",
    i.sourcingOrder?.sourcingNumber ?? "",
    new Date(i.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "material-intakes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Every action maps to real, backend-supported functionality:
// - Awaiting Acceptance reuses the existing stage filter
//   (A09_CERTIFICATE_VERIFIED — inspection complete, waiting on a
//   Management/Admin role to record the accept/hold/reject decision).
// - Awaiting Stock Release reuses the existing stage filter
//   (A13_YARD_STORED — stored in the yard, waiting on a Management/Admin
//   role to release to stock).
// - On Hold Intakes reuses the existing status filter.
// - Export Material Intakes fetches up to EXPORT_LIMIT intakes matching the
//   current filters via the existing paginated list endpoint and writes a
//   real CSV from that response — no backend export endpoint exists, so
//   this is capped and client-side rather than claiming a server-side export.
export function QuickActions({
  data, isLoading, isError, isFetching, onRetry, filters,
  onFilterAwaitingAcceptance, onFilterAwaitingRelease, onFilterOnHold,
}: Props) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  // Distinguish "not loaded yet" (null) from "loaded and genuinely zero" —
  // counts must never render as a bare 0 while the aggregate query is still
  // pending (e.g. before the persisted auth token hydrates on page load).
  const rows = data?.data;
  const awaitingAcceptanceCount = isLoading || !rows ? null : rows.filter((r) => r.stage === "A09_CERTIFICATE_VERIFIED").length;
  const awaitingReleaseCount = isLoading || !rows ? null : rows.filter((r) => r.stage === "A13_YARD_STORED").length;
  const onHoldCount = isLoading || !rows ? null : rows.filter((r) => r.status === "ON_HOLD").length;

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState
            onRetry={onRetry ?? (() => {})}
            isRetrying={isFetching}
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
      const res = await MaterialIntakeService.getAll(accessToken, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        page: 1,
        limit: EXPORT_LIMIT,
      });
      if (res.data.length === 0) {
        toast("No material intakes match the current filters.", "error");
        return;
      }
      exportToCSV(res.data);
      const suffix = res.pagination.total > EXPORT_LIMIT ? ` (first ${EXPORT_LIMIT} of ${res.pagination.total})` : "";
      toast(`Exported ${res.data.length} intake${res.data.length === 1 ? "" : "s"}${suffix}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const actions = [
    {
      label: "Awaiting Acceptance",
      description:
        awaitingAcceptanceCount === null
          ? "Intakes inspected, awaiting the acceptance decision."
          : `${awaitingAcceptanceCount} intake${awaitingAcceptanceCount === 1 ? "" : "s"} inspected, awaiting the acceptance decision.`,
      icon: ClipboardCheck,
      tone: "text-purple-700 bg-purple-50",
      onClick: onFilterAwaitingAcceptance,
    },
    {
      label: "Awaiting Stock Release",
      description:
        awaitingReleaseCount === null
          ? "Intakes stored, awaiting release to stock."
          : `${awaitingReleaseCount} intake${awaitingReleaseCount === 1 ? "" : "s"} stored, awaiting release to stock.`,
      icon: ShieldCheck,
      tone: "text-teal-700 bg-teal-50",
      onClick: onFilterAwaitingRelease,
    },
    {
      label: "On Hold Intakes",
      description:
        onHoldCount === null
          ? "Intakes currently on hold."
          : onHoldCount === 0
            ? "No intakes currently on hold."
            : `${onHoldCount} intake${onHoldCount === 1 ? "" : "s"} on hold.`,
      icon: PauseCircle,
      tone: onHoldCount && onHoldCount > 0 ? "text-red-700 bg-red-50" : "text-slate-700 bg-slate-100",
      onClick: onFilterOnHold,
    },
    {
      label: "Export Material Intakes",
      description: exporting ? "Preparing CSV..." : `Download intakes matching current filters (up to ${EXPORT_LIMIT}).`,
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
