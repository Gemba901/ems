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
  // endpoint for a total (all statuses) and an ON_HOLD-scoped total,
  // rather than adding a new backend aggregation route for this card.
  const intakesTotal = useQuery({
    queryKey: ["steel-intake-total"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { page: 1, limit: 1 }),
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

  const queries = [plans, sourcing, intakesTotal, intakesOnHold, chargePreps];
  const allFailed = queries.every((q) => q.isError);
  const anyFetching = queries.some((q) => q.isFetching);
  const retryAll = () => queries.forEach((q) => q.refetch());

  const stats: Record<
    string,
    { total: number | null; pending: number | null; isLoading: boolean }
  > = {
    P01: {
      total: plans.data?.total ?? null,
      pending: plans.data ? plans.data.total - (plans.data.byStatus["RELEASED"] ?? 0) - (plans.data.byStatus["CANCELLED"] ?? 0) : null,
      isLoading: plans.isLoading,
    },
    P02: {
      total: sourcing.data?.total ?? null,
      pending: sourcing.data ? sourcing.data.total - (sourcing.data.byStatus["CLOSED"] ?? 0) - (sourcing.data.byStatus["CANCELLED"] ?? 0) : null,
      isLoading: sourcing.isLoading,
    },
    P03: {
      total: intakesTotal.data?.pagination.total ?? null,
      pending: intakesOnHold.data?.pagination.total ?? null,
      isLoading: intakesTotal.isLoading || intakesOnHold.isLoading,
    },
    P04: {
      total: chargePreps.data?.total ?? null,
      pending: chargePreps.data ? chargePreps.data.total - (chargePreps.data.byStatus["CLOSED"] ?? 0) - (chargePreps.data.byStatus["CANCELLED"] ?? 0) : null,
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
                className={`h-full rounded-2xl border p-4 transition-colors ${
                  process.live
                    ? "border-slate-300 bg-white hover:border-slate-400 cursor-pointer"
                    : "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${process.live ? "bg-slate-800" : "bg-slate-300"}`}>
                    <Icon className="h-4.5 w-4.5 text-white" />
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
                <p className="text-xs font-mono text-slate-400 mb-1">{process.code}</p>
                <p className="text-sm font-semibold text-slate-900 mb-1">{process.name}</p>
                <p className="text-xs text-slate-500 leading-snug mb-3">{process.description}</p>

                {process.live ? (
                  stat?.isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span>
                          <span className="font-semibold text-slate-700">{stat?.total ?? "—"}</span> total
                        </span>
                        <span>
                          <span className="font-semibold text-amber-600">{stat?.pending ?? "—"}</span> pending
                        </span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-slate-400">Not available yet</p>
                )}
              </div>
            );

            return process.live ? (
              <Link key={process.code} href={process.href}>
                {cardContent}
              </Link>
            ) : (
              <div key={process.code}>{cardContent}</div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
