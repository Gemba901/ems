"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelPlanSummary, SteelPlanStage, SteelPlanOverallStatus } from "@/services/steel.service";

interface Props {
  summary?: SteelPlanSummary;
  isLoading: boolean;
}

interface Category {
  key: string;
  name: string;
  description: string;
  color: string; // hex, used by both the dot and the donut slice
  dotClass: string;
}

// Six real, mutually-exclusive workflow categories derived from the actual
// P01 state machine (STAGE_ORDER/SteelPlanOverallStatus) — not a literal
// copy of any illustrative example. Status is checked first (ON_HOLD /
// CANCELLED / RELEASED can happen at any stage, per updateStatus/releasePlan
// in the backend), and the remaining active plans are grouped by their
// current stage phase. This requires the (stage, status) cross-tab
// (summary.byStageStatus) rather than the independent byStage/byStatus
// groupings, since a plan's stage and status can't be recombined client-side
// without it.
const CATEGORIES: (Category & {
  matches: (stage: SteelPlanStage, status: SteelPlanOverallStatus) => boolean;
})[] = [
  {
    key: "demand-spec",
    name: "Demand & Specification",
    description: "Demand, priority, product & spec confirmed",
    color: "#2563eb",
    dotClass: "bg-blue-600",
    matches: (stage, status) =>
      !["ON_HOLD", "CANCELLED", "RELEASED"].includes(status) &&
      ["A01_DEMAND_CAPTURED", "A02_PRIORITY_CONFIRMED", "A03_PRODUCT_CONFIRMED", "A04_SPEC_CONFIRMED"].includes(stage),
  },
  {
    key: "stock-route",
    name: "Stock & Route",
    description: "Stock availability & plant route checked",
    color: "#f97316",
    dotClass: "bg-orange-500",
    matches: (stage, status) =>
      !["ON_HOLD", "CANCELLED", "RELEASED"].includes(status) &&
      ["A05_STOCK_CHECKED", "A06_STOCK_DECISION_MADE", "A07_ROUTE_SELECTED"].includes(stage),
  },
  {
    key: "planning",
    name: "Planning in Progress",
    description: "Capacity checked & production plan drafted",
    color: "#9333ea",
    dotClass: "bg-purple-600",
    matches: (stage, status) =>
      !["ON_HOLD", "CANCELLED", "RELEASED"].includes(status) &&
      ["A08_MATERIAL_CHECKED", "A09_CAPACITY_CHECKED", "A10_PLAN_DRAFTED"].includes(stage),
  },
  {
    key: "awaiting-approval",
    name: "Awaiting Approval",
    description: "Plan communicated, pending release",
    color: "#eab308",
    dotClass: "bg-yellow-500",
    matches: (stage, status) => !["ON_HOLD", "CANCELLED", "RELEASED"].includes(status) && stage === "A11_PLAN_COMMUNICATED",
  },
  {
    key: "released",
    name: "Released",
    description: "Approved & released to execution",
    color: "#10b981",
    dotClass: "bg-emerald-500",
    matches: (_stage, status) => status === "RELEASED",
  },
  {
    key: "hold-cancelled",
    name: "On Hold / Cancelled",
    description: "Not currently proceeding",
    color: "#ef4444",
    dotClass: "bg-red-500",
    matches: (_stage, status) => status === "ON_HOLD" || status === "CANCELLED",
  },
];

export function StageOverview({ summary, isLoading }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

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

  const counts = CATEGORIES.map((cat) => ({
    ...cat,
    count: summary.byStageStatus
      .filter((r) => cat.matches(r.stage, r.status))
      .reduce((sum, r) => sum + r.count, 0),
  }));

  const chartData = counts
    .filter((c) => c.count > 0)
    .map((c) => ({ key: c.key, name: c.name, value: c.count, color: c.color }));

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

        {/* Workflow category list */}
        <div className="space-y-0.5">
          {counts.map((cat) => {
            const isActive = activeKey === cat.key;
            return (
              <div
                key={cat.key}
                onMouseEnter={() => setActiveKey(cat.key)}
                onMouseLeave={() => setActiveKey(null)}
                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                  isActive ? "bg-slate-50" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${cat.dotClass}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">{cat.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{cat.description}</p>
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
