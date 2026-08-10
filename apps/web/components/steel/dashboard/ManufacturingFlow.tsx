"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/auth.store";
import { SteelService } from "@/services/steel.service";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { ChargePreparationService } from "@/services/steel-charge-preparation.service";
import { STEEL_PROCESSES } from "./steelProcesses";

type FlowStatus = "live" | "attention" | "future";

const STATUS_RING: Record<FlowStatus, string> = {
  live: "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer",
  attention: "border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer",
  future: "border-dashed border-slate-300 bg-slate-50 text-slate-400 cursor-default",
};

const STATUS_LABEL: Record<FlowStatus, string> = {
  live: "Live",
  attention: "Attention",
  future: "Future",
};

export function ManufacturingFlow() {
  const { accessToken } = useAuthStore();

  // Each existing /summary endpoint already breaks counts down by status —
  // "attention" here means the process has at least one ON_HOLD record,
  // which is real signal already returned by those endpoints.
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
  const intakeOnHold = useQuery({
    queryKey: ["steel-intake-on-hold-count"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { status: "ON_HOLD", page: 1, limit: 1 }),
    enabled: !!accessToken,
  });
  // Real — same paginated list endpoint, filtered to IN_PROGRESS, read from
  // its pagination total. Gives P03 a "currently active" count without a
  // dedicated summary endpoint.
  const intakeInProgress = useQuery({
    queryKey: ["steel-intake-in-progress-count"],
    queryFn: () => MaterialIntakeService.getAll(accessToken!, { status: "IN_PROGRESS", page: 1, limit: 1 }),
    enabled: !!accessToken,
  });
  const chargePreps = useQuery({
    queryKey: ["steel-charge-summary"],
    queryFn: () => ChargePreparationService.getSummary(accessToken!),
    enabled: !!accessToken,
  });

  // Each metric/label pairs a real number with the term that actually
  // describes it for that process — not a generic "Active" reused everywhere.
  const countsByCode: Record<string, { metric: number | null; metricLabel: string; status: FlowStatus }> = {
    P01: {
      metric: plans.data ? plans.data.byStatus["IN_PROGRESS"] ?? 0 : null,
      metricLabel: "Active Plans",
      status: (plans.data?.byStatus["ON_HOLD"] ?? 0) > 0 ? "attention" : "live",
    },
    P02: {
      metric: sourcing.data
        ? sourcing.data.total - (sourcing.data.byStatus["CLOSED"] ?? 0) - (sourcing.data.byStatus["CANCELLED"] ?? 0)
        : null,
      metricLabel: "Active Orders",
      status: (sourcing.data?.byStatus["ON_HOLD"] ?? 0) > 0 ? "attention" : "live",
    },
    P03: {
      metric: intakeInProgress.data?.pagination.total ?? null,
      metricLabel: "Active Intakes",
      status: (intakeOnHold.data?.pagination.total ?? 0) > 0 ? "attention" : "live",
    },
    P04: {
      metric: chargePreps.data ? chargePreps.data.byStage["A11_CHARGE_RELEASED"] ?? 0 : null,
      metricLabel: "Charges Ready",
      status: (chargePreps.data?.byStatus["ON_HOLD"] ?? 0) > 0 ? "attention" : "live",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manufacturing Flow</CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="flex items-center overflow-x-auto gap-1 pb-2">
            {STEEL_PROCESSES.map((process, idx) => {
              const Icon = process.icon;
              const info = countsByCode[process.code];
              const status: FlowStatus = process.live ? info?.status ?? "live" : "future";

              const node = (
                <div className="flex flex-col items-center gap-1.5 w-[92px] shrink-0">
                  <div
                    className={`h-11 w-11 rounded-full flex items-center justify-center border-2 transition-colors ${STATUS_RING[status]}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{process.code}</span>
                  {process.live && (
                    <span className="text-[9px] text-slate-400 leading-tight text-center">
                      {info?.metric !== null && info?.metric !== undefined
                        ? `${info.metric} ${info.metricLabel}`
                        : "—"}
                    </span>
                  )}
                </div>
              );

              return (
                <div key={process.code} className="flex items-center shrink-0">
                  <Tooltip>
                    <TooltipTrigger
                      render={(triggerProps) =>
                        process.live ? (
                          <Link {...triggerProps} href={process.href}>
                            {node}
                          </Link>
                        ) : (
                          <div {...triggerProps}>{node}</div>
                        )
                      }
                    />
                    <TooltipContent>
                      <p className="font-semibold">
                        {process.code} — {process.name}
                      </p>
                      <p className="text-slate-300 mt-0.5">{process.description}</p>
                      <p className="text-slate-400 mt-1 italic">
                        {process.live ? STATUS_LABEL[status] : "Coming soon"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  {idx < STEEL_PROCESSES.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mx-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
