"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ClipboardCheck, CalendarClock, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelService, STAGE_LABELS, type SteelPlanSummary } from "@/services/steel.service";
import type { P01FiltersState } from "./P01Filters";

interface Props {
  summary?: SteelPlanSummary;
  filters: P01FiltersState;
  onFilterPendingApproval: () => void;
  onViewSchedule: () => void;
}

const EXPORT_LIMIT = 500;

function exportToCSV(plans: Array<{
  planNumber: string;
  status: string;
  stage: string;
  productType: string | null;
  grade: string | null;
  totalQuantity: number | null;
  requestedQuantityTonnes: number;
  customerName: string | null;
  createdAt: string;
}>) {
  const headers = ["Plan Number", "Status", "Stage", "Product", "Grade", "Quantity (t)", "Customer", "Created"];
  const rows = plans.map((p) => [
    p.planNumber,
    p.status,
    STAGE_LABELS[p.stage as keyof typeof STAGE_LABELS] ?? p.stage,
    p.productType ?? "",
    p.grade ?? "",
    String(p.totalQuantity ?? p.requestedQuantityTonnes),
    `"${(p.customerName ?? "").replace(/"/g, '""')}"`,
    new Date(p.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "production-plans.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Every action maps to real, backend-supported functionality:
// - Pending Approvals reuses the existing stage/status query params.
// - Production Schedule uses the new fromDate/toDate range params
//   (today .. +30 days) — a real filter over real dates, not a fabricated
//   count. The 30-day window is a UI framing choice, not invented data.
// - Export Plans fetches up to EXPORT_LIMIT plans matching the current
//   filters (including any active date range) via the existing paginated
//   list endpoint and writes a real CSV from that response — no backend
//   export endpoint exists, so this is capped and client-side rather than
//   claiming a server-side export.
export function QuickActions({ summary, filters, onFilterPendingApproval, onViewSchedule }: Props) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const scheduledCount = useQuery({
    queryKey: ["steel-plans-scheduled-count", today, in30Days],
    queryFn: () =>
      SteelService.getAll(accessToken!, { fromDate: today, toDate: in30Days, page: 1, limit: 1 }),
    enabled: !!accessToken,
  });

  const pendingApprovalCount = summary?.byStage["A11_PLAN_COMMUNICATED"] ?? null;

  async function handleExport() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const res = await SteelService.getAll(accessToken, {
        search: filters.search || undefined,
        stage: filters.stage || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        scheduledOnly: filters.scheduledOnly || undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        page: 1,
        limit: EXPORT_LIMIT,
      });
      if (res.data.length === 0) {
        toast("No plans match the current filters.", "error");
        return;
      }
      exportToCSV(res.data);
      const suffix = res.pagination.total > EXPORT_LIMIT ? ` (first ${EXPORT_LIMIT} of ${res.pagination.total})` : "";
      toast(`Exported ${res.data.length} plan${res.data.length === 1 ? "" : "s"}${suffix}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const actions = [
    {
      label: "New Production Plan",
      description: "Create a new P01 plan.",
      icon: Plus,
      tone: "text-blue-700 bg-blue-50",
      as: "link" as const,
      href: "/steel/p01/new",
    },
    {
      label: "Pending Approvals",
      description:
        pendingApprovalCount === null
          ? "Plans communicated and awaiting release."
          : `${pendingApprovalCount} plan${pendingApprovalCount === 1 ? "" : "s"} communicated, awaiting release.`,
      icon: ClipboardCheck,
      tone: "text-purple-700 bg-purple-50",
      as: "button" as const,
      onClick: onFilterPendingApproval,
    },
    {
      label: "Production Schedule",
      description: scheduledCount.isLoading
        ? "Loading..."
        : `${scheduledCount.data?.pagination.total ?? 0} plans scheduled in the next 30 days.`,
      icon: CalendarClock,
      tone: "text-teal-700 bg-teal-50",
      as: "button" as const,
      onClick: onViewSchedule,
    },
    {
      label: "Export Plans",
      description: exporting
        ? "Preparing CSV..."
        : `Download plans matching current filters (up to ${EXPORT_LIMIT}).`,
      icon: exporting ? Loader2 : Download,
      iconClassName: exporting ? "animate-spin" : "",
      tone: "text-slate-700 bg-slate-100",
      as: "button" as const,
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
            const content = (
              <>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${action.tone}`}>
                  <Icon className={`h-4.5 w-4.5 ${action.iconClassName ?? ""}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="text-xs text-slate-500 leading-snug">{action.description}</p>
                </div>
              </>
            );

            const className =
              "w-full flex items-start gap-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm px-3 py-3 text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed";

            return action.as === "link" ? (
              <Link key={action.label} href={action.href} className={className}>
                {content}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={"disabled" in action ? action.disabled : false}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
