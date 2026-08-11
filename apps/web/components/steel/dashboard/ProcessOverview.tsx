"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { STEEL_PROCESSES } from "./steelProcesses";
import { QueryErrorState } from "./QueryErrorState";

interface ProcessStat {
  primary: number | null;
  primaryLabel: string;
  secondary: number | null;
  secondaryLabel: string;
  isLoading: boolean;
}

export function ProcessOverview() {
  const { accessToken } = useAuthStore();

  const plans = useQuery({
    queryKey: ["steel-plans-summary"],
    queryFn: () => SteelService.getSummary(accessToken!),
    enabled: !!accessToken,
  });
  const sourcing = useQuery({
    queryKey: ["steel-sourcing-summary"],
    queryFn: () => SteelSourcingService.getSummary(accessToken!),
    enabled: !!accessToken,
  });
  // P03 has no /summary endpoint — reuse the existing paginated list
  // endpoint, filtered per status, and read the totals from its pagination
  // metadata, rather than adding a new backend aggregation route.
  const intakesTotal = useQuery({
    queryKey: ["steel-intake-total"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { page: 1, limit: 1 }),
    enabled: !!accessToken,
  });
  const intakesInProgress = useQuery({
    queryKey: ["steel-intake-in-progress-count"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { status: "IN_PROGRESS", page: 1, limit: 1 }),
    enabled: !!accessToken,
  });
  const intakesOnHold = useQuery({
    queryKey: ["steel-intake-on-hold-count"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { status: "ON_HOLD", page: 1, limit: 1 }),
    enabled: !!accessToken,
  });
  const chargePreps = useQuery({
    queryKey: ["steel-charge-summary"],
    queryFn: () => ChargePreparationService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  const queries = [plans, sourcing, intakesTotal, intakesInProgress, intakesOnHold, chargePreps];
  const allFailed = queries.every((q) => q.isError);
  const anyFetching = queries.some((q) => q.isFetching);
  const retryAll = () => queries.forEach((q) => q.refetch());

  const stats: Record<string, ProcessStat> = {
    P01: {
      primary: plans.data ? plans.data.byStatus["IN_PROGRESS"] ?? 0 : null,
      primaryLabel: "Active Plans",
      secondary: plans.data ? plans.data.byStatus["ON_HOLD"] ?? 0 : null,
      secondaryLabel: "On Hold",
      isLoading: plans.isLoading,
    },
    P02: {
      primary: sourcing.data
        ? sourcing.data.total - (sourcing.data.byStatus["CLOSED"] ?? 0) - (sourcing.data.byStatus["CANCELLED"] ?? 0)
        : null,
      primaryLabel: "Active Orders",
      secondary: sourcing.data ? sourcing.data.byStatus["ON_HOLD"] ?? 0 : null,
      secondaryLabel: "On Hold",
      isLoading: sourcing.isLoading,
    },
    P03: {
      primary: intakesInProgress.data?.pagination.total ?? null,
      primaryLabel: "Active Intakes",
      secondary: intakesOnHold.data?.pagination.total ?? null,
      secondaryLabel: "On Hold",
      isLoading: intakesTotal.isLoading || intakesInProgress.isLoading,
    },
    P04: {
      primary: chargePreps.data ? chargePreps.data.byStage["A11_CHARGE_RELEASED"] ?? 0 : null,
      primaryLabel: "Charges Ready",
      secondary: chargePreps.data ? chargePreps.data.byStatus["ON_HOLD"] ?? 0 : null,
      secondaryLabel: "On Hold",
      isLoading: chargePreps.isLoading,
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {allFailed && (
          <QueryErrorState onRetry={retryAll} isRetrying={anyFetching} message="Could not load process data." />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STEEL_PROCESSES.map((process) => {
            const Icon = process.icon;
            const stat = stats[process.code];

            const cardContent = (
              <div
                className={`h-full rounded-2xl border p-4 flex flex-col transition-all ${
                  process.live
                    ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer"
                    : "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${process.live ? process.color.bg : "bg-slate-200"}`}>
                    <Icon className={`h-5 w-5 ${process.live ? process.color.text : "text-slate-400"}`} />
                  </div>
                  {process.live ? (
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400">
                      Not started
                    </Badge>
                  )}
                </div>

                <p className="text-[10px] font-mono text-slate-400 mb-0.5">{process.code}</p>
                <p className="text-sm font-semibold text-slate-900 mb-1">{process.shortName}</p>
                <p className="text-xs text-slate-500 leading-snug mb-3">{process.description}</p>

                {process.live ? (
                  stat?.isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
                  ) : (
                    <div className="mt-auto space-y-2.5">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-600">
                          <span className="font-semibold text-slate-900">{stat?.primary ?? "—"}</span> {stat?.primaryLabel}
                        </span>
                        <span className="text-slate-500">
                          <span className="font-semibold text-amber-600">{stat?.secondary ?? "—"}</span> {stat?.secondaryLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-end">
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-slate-400">
                          View all <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-slate-400 mt-auto">Not available yet</p>
                )}
              </div>
            );

            return process.live ? (
              <Link key={process.code} href={process.href} className="flex">
                {cardContent}
              </Link>
            ) : (
              <div key={process.code} className="flex">
                {cardContent}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
