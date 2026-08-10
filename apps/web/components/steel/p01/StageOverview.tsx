"use client";

import { Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_LABELS, type SteelPlanStage, type SteelPlanSummary } from "@/services/steel.service";

interface Props {
  summary?: SteelPlanSummary;
  isLoading: boolean;
}

// Groups the real 12 stages into the same phases the workbook activities
// naturally fall into (A01-A04 demand/spec, A05-A07 stock/route,
// A08-A10 capacity/scheduling, A11-A12 release) — no stage is removed or
// renamed, this is purely a visual grouping of the same STAGE_ORDER data.
const PHASES: { name: string; stages: SteelPlanStage[] }[] = [
  { name: "Demand & Specification", stages: ["A01_DEMAND_CAPTURED", "A02_PRIORITY_CONFIRMED", "A03_PRODUCT_CONFIRMED", "A04_SPEC_CONFIRMED"] },
  { name: "Stock & Route", stages: ["A05_STOCK_CHECKED", "A06_STOCK_DECISION_MADE", "A07_ROUTE_SELECTED"] },
  { name: "Capacity & Scheduling", stages: ["A08_MATERIAL_CHECKED", "A09_CAPACITY_CHECKED", "A10_PLAN_DRAFTED"] },
  { name: "Release", stages: ["A11_PLAN_COMMUNICATED", "A12_PLAN_RELEASED"] },
];

export function StageOverview({ summary, isLoading }: Props) {
  if (isLoading || !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stage Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        </CardContent>
      </Card>
    );
  }

  // "Bottleneck" = the stage currently holding the most plans, excluding the
  // terminal A12 stage (released plans aren't stuck anywhere). Real, derived
  // directly from summary.byStage — not fabricated.
  const wipStages = Object.entries(summary.byStage).filter(
    ([stage, count]) => stage !== "A12_PLAN_RELEASED" && (count ?? 0) > 0,
  ) as [SteelPlanStage, number][];
  const bottleneck = wipStages.sort((a, b) => b[1] - a[1])[0];
  const onHold = summary.byStatus["ON_HOLD"] ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(bottleneck || onHold > 0) && (
          <div className="flex flex-wrap gap-2">
            {bottleneck && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <span className="font-semibold">{bottleneck[1]}</span>
                plans currently at <span className="font-medium">{STAGE_LABELS[bottleneck[0]]}</span> — largest concentration
              </div>
            )}
            {onHold > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="font-semibold">{onHold}</span> {onHold === 1 ? "plan" : "plans"} on hold (stage not specified by status)
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {PHASES.map((phase) => {
            const phaseTotal = phase.stages.reduce((sum, s) => sum + (summary.byStage[s] ?? 0), 0);
            return (
              <div key={phase.name} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600">{phase.name}</p>
                  <span className="text-xs font-bold text-slate-900">{phaseTotal}</span>
                </div>
                <div className="space-y-1.5">
                  {phase.stages.map((stage) => {
                    const count = summary.byStage[stage] ?? 0;
                    const isBottleneck = bottleneck?.[0] === stage;
                    return (
                      <div key={stage} className="flex items-center justify-between text-[11px]">
                        <span className={isBottleneck ? "font-semibold text-blue-700" : "text-slate-500"}>
                          {STAGE_LABELS[stage]}
                        </span>
                        <span className={isBottleneck ? "font-semibold text-blue-700" : "text-slate-400"}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
