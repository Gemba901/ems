"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, ClipboardCheck, CalendarClock, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { SteelService, type SteelPlanSummary } from "@/services/steel.service";

interface Props {
  summary?: SteelPlanSummary;
  onFilterPendingApproval: () => void;
  onFilterAttention: () => void;
  onViewSchedule: () => void;
}

// Every action maps to a real, backend-supported filter — "Pending
// Approvals" and "Plans Requiring Attention" reuse the existing
// stage/status query params; "Production Schedule" reuses the new
// scheduledOnly + sortBy=plannedStartDate params (see steel.service.ts).
// No new "smart" business logic, no fabricated counts.
export function QuickActions({ summary, onFilterPendingApproval, onFilterAttention, onViewSchedule }: Props) {
  const { accessToken } = useAuthStore();

  // Real — reuses the existing paginated list endpoint filtered to
  // scheduledOnly, reading the total from its pagination metadata.
  const scheduledCount = useQuery({
    queryKey: ["steel-plans-scheduled-count"],
    queryFn: () => SteelService.getAll(accessToken!, { scheduledOnly: true, page: 1, limit: 1 }),
    enabled: !!accessToken,
  });

  const pendingApprovalCount = summary?.byStage["A11_PLAN_COMMUNICATED"] ?? null;
  const onHoldCount = summary?.byStatus["ON_HOLD"] ?? null;

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
      description: scheduledCount.isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin inline" />
      ) : (
        `Review production planning timelines — ${scheduledCount.data?.pagination.total ?? 0} plans scheduled.`
      ),
      icon: CalendarClock,
      tone: "text-teal-700 bg-teal-50",
      as: "button" as const,
      onClick: onViewSchedule,
    },
    {
      label: "Plans Requiring Attention",
      description:
        onHoldCount === null
          ? "Plans currently on hold."
          : onHoldCount === 0
            ? "No plans currently on hold."
            : `${onHoldCount} plan${onHoldCount === 1 ? "" : "s"} on hold.`,
      icon: AlertTriangle,
      tone: onHoldCount ? "text-amber-700 bg-amber-50" : "text-slate-400 bg-slate-100",
      as: "button" as const,
      onClick: onFilterAttention,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            const content = (
              <>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${action.tone}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="text-xs text-slate-500 leading-snug">{action.description}</p>
                </div>
              </>
            );

            const className =
              "flex items-start gap-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm px-3 py-3 text-left transition-all";

            return action.as === "link" ? (
              <Link key={action.label} href={action.href} className={className}>
                {content}
              </Link>
            ) : (
              <button key={action.label} type="button" onClick={action.onClick} className={className}>
                {content}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
