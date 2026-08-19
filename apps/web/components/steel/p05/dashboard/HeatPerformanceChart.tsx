"use client";

import { Loader2, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

interface ChartPoint {
  heatId: string;
  furnaceCode: string;
  input: number | null;
  output: number | null;
  loss: number | null;
  yieldPercent: number | null;
  cycleDurationMinutes: number | null;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm text-xs space-y-0.5">
      <p className="font-semibold text-slate-900">{p.heatId}</p>
      <p className="text-slate-500">Furnace {p.furnaceCode}</p>
      <p>Input: {p.input ?? "—"}</p>
      <p>Output: {p.output ?? "—"}</p>
      <p>Loss: {p.loss !== null ? p.loss.toFixed(2) : "—"}</p>
      <p>Yield: {p.yieldPercent !== null ? `${p.yieldPercent.toFixed(1)}%` : "—"}</p>
      <p>Cycle: {p.cycleDurationMinutes !== null ? `${Math.round(p.cycleDurationMinutes)} min` : "—"}</p>
    </div>
  );
}

// Yield % for the most recent completed heats (oldest→newest, left→right).
// No target/reference line is drawn — the data model has no target-yield
// field, and the spec explicitly says not to fabricate one.
export function HeatPerformanceChart({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const heats = data?.recentHeats
    .filter((h) => h.yieldPercent !== null)
    .slice(0, 20)
    .reverse();

  const chartData: ChartPoint[] = (heats ?? []).map((h) => ({
    heatId: h.heatInProcessNumber,
    furnaceCode: h.furnace?.code ?? "—",
    input: h.materialInput,
    output: h.output,
    loss: h.materialLoss,
    yieldPercent: h.yieldPercent,
    cycleDurationMinutes: h.cycleDurationMinutes,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-blue-500" />
          Heat Performance — Yield % by Heat
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load heat performance." />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No completed heats with yield data in this period yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="heatId" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="yieldPercent" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
