"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { SCREENS } from "./screenMap";
import type { SteelPlanSummary } from "@/services/steel.service";

interface Props {
  summary?: SteelPlanSummary;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// A fixed color palette assigned in S1-S4 order — purely presentational,
// not derived from any backend data.
const SCREEN_COLORS = ["#2563eb", "#f97316", "#0ea5e9", "#9333ea", "#eab308", "#10b981"];
const SCREEN_DOT_CLASSES = ["bg-blue-600", "bg-orange-500", "bg-sky-500", "bg-purple-600", "bg-yellow-500", "bg-emerald-500"];

export function StageOverview({ summary, isLoading, isError, isFetching, onRetry }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stage Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load stage overview." />
        </CardContent>
      </Card>
    );
  }

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

  // Counts derived from the real per-stage summary (summary.byStage),
  // grouped into the same S1-S4 screens the workflow itself uses — the
  // canonical mapping lives once in screenMap.ts, not duplicated here.
  const counts = SCREENS.map((screen, i) => ({
    code: screen.code,
    name: screen.label,
    color: SCREEN_COLORS[i],
    dotClass: SCREEN_DOT_CLASSES[i],
    count: screen.stages.reduce((sum, stage) => sum + (summary.byStage[stage] ?? 0), 0),
  }));

  const chartData = counts
    .filter((c) => c.count > 0)
    .map((c) => ({ key: c.code, name: c.name, value: c.count, color: c.color }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Donut chart — kept single-column since this card now lives in a
            narrow sidebar column; a side-by-side split would be cramped. */}
        <div className="relative">
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No production plans yet.</p>
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
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total</span>
                <span className="text-2xl font-bold text-slate-900">{summary.total}</span>
                <span className="text-[11px] text-slate-400">Total Plans</span>
              </div>
            </>
          )}
        </div>

        {/* S1-S4 workflow screen list */}
        <div className="space-y-0.5">
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
                  <span className={`h-2 w-2 rounded-full shrink-0 ${cat.dotClass}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">
                      <span className="text-slate-400 font-mono mr-1">{cat.code}</span>
                      {cat.name}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900 shrink-0">{cat.count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
