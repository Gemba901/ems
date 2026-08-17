"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";
import { Loader2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { SCREENS } from "./screenMap";
import type { SteelChargeSummary, SteelChargeStage } from "@/services/steel-charge-preparation.service";

interface Props {
  data?: SteelChargeSummary;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

const SCREEN_COLORS = ["#2563eb", "#f97316", "#10b981"];
const SCREEN_DOT_CLASSES = ["bg-blue-600", "bg-orange-500", "bg-emerald-500"];

const SCREEN_DESCRIPTIONS: Record<string, string> = {
  S1: "Confirm the plan and select the material lots to use.",
  S2: "Sort, clean, and stage the material, then build the recipe.",
  S3: "Verify the material, release the Charge ID, and hand it to the furnace.",
};

// Unlike P02/P03, this reads directly from the real GET
// /steel/charge-preparation/summary endpoint — grouped through the
// canonical screenMap.ts, never a second taxonomy.
export function StageOverview({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparation Process Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load process overview." />
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparation Process Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        </CardContent>
      </Card>
    );
  }

  const counts = SCREENS.map((screen, i) => ({
    code: screen.code,
    name: screen.label,
    description: SCREEN_DESCRIPTIONS[screen.code],
    color: SCREEN_COLORS[i],
    dotClass: SCREEN_DOT_CLASSES[i],
    count: screen.stages.reduce((sum, stage) => sum + (data.byStage[stage as SteelChargeStage] ?? 0), 0),
  }));

  const chartData = counts
    .filter((c) => c.count > 0)
    .map((c) => ({ key: c.code, name: c.name, value: c.count, color: c.color }));

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>Preparation Process Overview</CardTitle>
            <Tooltip>
              <TooltipTrigger render={(triggerProps) => <Info {...triggerProps} className="h-3.5 w-3.5 text-slate-400" />} />
              <TooltipContent>
                These three screens group the real preparation steps into the stages a user actually works through.
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            {chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No charge preparations yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={74}
                      paddingAngle={chartData.length > 1 ? 3 : 0}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActiveKey(chartData[index].key)}
                      onMouseLeave={() => setActiveKey(null)}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          stroke="none"
                          opacity={activeKey && activeKey !== entry.key ? 0.35 : 1}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      formatter={(value, name) => [value, name]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total</span>
                  <span className="text-2xl font-bold text-slate-900">{data.total}</span>
                  <span className="text-[11px] text-slate-400">Charge Preparations</span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            {counts.map((cat) => {
              const isActive = activeKey === cat.code;
              return (
                <div
                  key={cat.code}
                  onMouseEnter={() => setActiveKey(cat.code)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                    isActive ? "bg-slate-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 mt-0.5 ${cat.dotClass}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        <span className="text-slate-400 font-mono mr-1">{cat.code}</span>
                        {cat.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{cat.description}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-900 shrink-0">{cat.count}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
