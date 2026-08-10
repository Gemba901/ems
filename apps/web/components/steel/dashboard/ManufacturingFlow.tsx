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

const STATUS_DOT: Record<FlowStatus, string> = {
  live: "bg-emerald-500",
  attention: "bg-amber-500",
  future: "bg-slate-300",
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
                <div className={`flex flex-col items-center gap-1.5 w-[96px] shrink-0 ${process.live ? "" : "opacity-50"}`}>
                  <div className="relative">
                    <div
                      className={`h-12 w-12 rounded-full flex items-center justify-center transition-transform ${process.color.bg} ${
                        process.live ? "hover:scale-105 cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${process.color.text}`} />
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${STATUS_DOT[status]}`}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{process.code}</span>
                  <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">
                    {process.shortName}
                  </span>
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
