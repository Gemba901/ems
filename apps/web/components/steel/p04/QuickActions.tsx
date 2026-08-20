"use client";

import { useState } from "react";
import { Scale, ShieldCheck, Flame, PauseCircle, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { ChargePreparationService, CHARGE_STAGE_LABELS, type SteelChargeSummary } from "@/services/steel-charge-preparation.service";
import type { P04FiltersState } from "./P04Filters";

interface Props {
  data?: SteelChargeSummary;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  filters: P04FiltersState;
  onFilterAwaitingVerification: () => void;
  onFilterAwaitingRelease: () => void;
  onFilterAwaitingHandover: () => void;
  onFilterOnHold: () => void;
}

const EXPORT_LIMIT = 500;

function exportToCSV(preps: Array<{
  prepNumber: string;
  status: string;
  stage: string;
  chargeNumber: string | null;
  plan: { planNumber: string } | null;
  createdAt: string;
}>) {
  const headers = ["Preparation Number", "Status", "Stage", "Charge ID", "Production Plan", "Created"];
  const rows = preps.map((p) => [
    p.prepNumber,
    p.status,
    CHARGE_STAGE_LABELS[p.stage as keyof typeof CHARGE_STAGE_LABELS] ?? p.stage,
    p.chargeNumber ?? "",
    p.plan?.planNumber ?? "",
    new Date(p.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "charge-preparations.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Every action maps to real, backend-supported functionality, using the
// real GET /steel/charge-preparation/summary counts (byStage) — not a
// bounded aggregation like P02/P03 needed, since P04 already has a summary
// endpoint.
export function QuickActions({
  data, isLoading, isError, isFetching, onRetry, filters,
  onFilterAwaitingVerification, onFilterAwaitingRelease, onFilterAwaitingHandover, onFilterOnHold,
}: Props) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const awaitingVerification = isLoading || !data ? null : data.byStage.A09_MATERIAL_STAGED ?? 0;
  const awaitingRelease = isLoading || !data ? null : data.byStage.A10_VERIFICATION_DONE ?? 0;
  const awaitingHandover = isLoading || !data ? null : data.byStage.A11_CHARGE_RELEASED ?? 0;
  const onHold = isLoading || !data ? null : data.byStatus.ON_HOLD ?? 0;

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load quick action data." />
        </CardContent>
      </Card>
    );
  }

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const res = await ChargePreparationService.getAll(accessToken, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        planId: filters.planId || undefined,
        page: 1,
        limit: EXPORT_LIMIT,
      });
      if (res.data.length === 0) {
        toast("No charge preparations match the current filters.", "error");
        return;
      }
      exportToCSV(res.data);
      const suffix = res.pagination.total > EXPORT_LIMIT ? ` (first ${EXPORT_LIMIT} of ${res.pagination.total})` : "";
      toast(`Exported ${res.data.length} preparation${res.data.length === 1 ? "" : "s"}${suffix}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const actions = [
    {
      label: "Awaiting Verification",
      description:
        awaitingVerification === null
          ? "Preparations staged, waiting on material verification."
          : `${awaitingVerification} preparation${awaitingVerification === 1 ? "" : "s"} staged, waiting on material verification.`,
      icon: Scale,
      tone: "text-purple-700 bg-purple-50",
      onClick: onFilterAwaitingVerification,
    },
    {
      label: "Awaiting Charge Release",
      description:
        awaitingRelease === null
          ? "Preparations verified, waiting on Charge ID release."
          : `${awaitingRelease} preparation${awaitingRelease === 1 ? "" : "s"} verified, waiting on Charge ID release.`,
      icon: ShieldCheck,
      tone: "text-blue-700 bg-blue-50",
      onClick: onFilterAwaitingRelease,
    },
    {
      label: "Awaiting Furnace Handover",
      description:
        awaitingHandover === null
          ? "Charges released, waiting on furnace handover."
          : `${awaitingHandover} preparation${awaitingHandover === 1 ? "" : "s"} released, waiting on furnace handover.`,
      icon: Flame,
      tone: "text-orange-700 bg-orange-50",
      onClick: onFilterAwaitingHandover,
    },
    {
      label: "On Hold Preparations",
      description:
        onHold === null
          ? "Preparations currently on hold."
          : onHold === 0
            ? "No preparations currently on hold."
            : `${onHold} preparation${onHold === 1 ? "" : "s"} on hold.`,
      icon: PauseCircle,
      tone: onHold && onHold > 0 ? "text-red-700 bg-red-50" : "text-slate-700 bg-slate-100",
      onClick: onFilterOnHold,
    },
    {
      label: "Export Charge Preparations",
      description: exporting ? "Preparing CSV..." : `Download preparations matching current filters (up to ${EXPORT_LIMIT}).`,
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
