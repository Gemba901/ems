"use client";

import Link from "next/link";
import { Loader2, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard, DashboardActiveHeat, DashboardRecentHeat } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// Bounded to a generous pull from the dashboard's activeHeats + recentHeats;
// ~10 rows are visible at once (see the scrollable tbody below) with the
// rest reachable by scrolling, plus "View All Heat Cycles" for the full list.
const MAX_ROWS = 25;
const VISIBLE_ROWS = 10;

type Row = {
  id: string;
  heatInProcessNumber: string;
  chargeNumberSnapshot: string | null;
  chargePreparationId: string;
  furnaceCode: string | null;
  liningCode: string | null;
  cycleMinutes: number | null;
  statusLabel: string;
  statusTone: string;
  yieldPercent: number | null;
  plannedTonnes: number | null;
  outputTonnes: number | null;
  startedAt: string | null;
}

// Real lining identifier from the linked FurnaceLining master-data record
// when liningRefId is set, falling back to the free-text campaign snapshot
// otherwise (legacy heats recorded before FurnaceLining existed). Prefers the
// lining's own `code` when set; older linings recorded before that field
// existed fall back to the installedAt/heatsCompleted label.
function liningLabel(lining: { code: string | null; installedAt: string; heatsCompleted: number } | null, liningCampaignId: string | null): string | null {
  if (lining) return lining.code ?? `Installed ${new Date(lining.installedAt).toLocaleDateString()} (${lining.heatsCompleted} heats)`;
  return liningCampaignId;
}

function fmtTonnes(n: number | null, digits = 1): string {
  return n === null ? "—" : `${n.toFixed(digits)}t`;
}

function fmtMinutes(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtEnergyPerTonne(kwh: number | null, tonnes: number | null): string {
  return kwh !== null && tonnes !== null && tonnes > 0 ? `${(kwh / tonnes).toFixed(0)} kWh/t` : "—";
}

function fromActive(h: DashboardActiveHeat): Row {
  return {
    id: h.id,
    heatInProcessNumber: h.heatInProcessNumber,
    chargeNumberSnapshot: h.chargeNumberSnapshot,
    chargePreparationId: h.chargePreparationId,
    furnaceCode: h.furnace?.code ?? null,
    liningCode: liningLabel(h.lining, h.liningCampaignId),
    cycleMinutes: h.meltingStartTime ? (Date.now() - new Date(h.meltingStartTime).getTime()) / 60000 : null,
    statusLabel: h.meltingStartTime ? "Melting" : "In Progress",
    // MELTING is a normal, healthy busy state — INFO per
    // STATUS_SEMANTIC_MAP in lib/steelStatusColors.ts, not ERROR (red).
    statusTone: "bg-blue-50 text-blue-700",
    yieldPercent: null,
    plannedTonnes: h.plannedChargeTonnes,
    outputTonnes: null,
    startedAt: h.startedAt ?? h.meltingStartTime,
  };
}

function fromRecent(h: DashboardRecentHeat): Row {
  const onTarget = h.varianceTonnes !== null && Math.abs(h.varianceTonnes) <= 0.05 * (h.plannedChargeTonnes ?? 1);
  return {
    id: h.id,
    heatInProcessNumber: h.heatInProcessNumber,
    chargeNumberSnapshot: h.chargeNumberSnapshot,
    chargePreparationId: h.chargePreparationId,
    furnaceCode: h.furnace?.code ?? null,
    liningCode: liningLabel(h.lining, h.liningCampaignId),
    cycleMinutes: h.outputMeltTimeMinutes ?? h.cycleDurationMinutes,
    statusLabel: h.varianceTonnes === null ? "Complete" : onTarget ? "On Target" : h.varianceTonnes < 0 ? "Below Target" : "Above Target",
    statusTone:
      h.varianceTonnes === null
        ? "bg-slate-100 text-slate-600"
        : onTarget
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700",
    yieldPercent: h.yieldPercent,
    plannedTonnes: h.plannedChargeTonnes,
    outputTonnes: h.output,
    startedAt: h.startedAt,
  };
}

/**
 * Section 2 — the dominant dashboard component. Combines currently-melting
 * heats (data.activeHeats) with the most recently completed ones
 * (data.recentHeats) into one bounded, dense table — never an endlessly
 * scrolling list. "Target Tonnes"/"Variance" are sourced from the P04
 * recipe (planned charge) snapshot, the only real target in the schema; a
 * heat with no recipe snapshot shows "—" rather than a fabricated number.
 */
export function HeatCycleTracker({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const liningById = new Map((data?.liningStatus ?? []).map((lining) => [lining.id, lining]));
  const liningHistoryById = new Map((data?.liningHistory ?? []).map((history) => [history.liningId, history]));
  const rows: Row[] = data
    ? [...data.activeHeats.map(fromActive), ...data.recentHeats.map(fromRecent)]
        .sort((a, b) => (b.startedAt ? new Date(b.startedAt).getTime() : 0) - (a.startedAt ? new Date(a.startedAt).getTime() : 0))
        .slice(0, MAX_ROWS)
    : [];

  const enrichRow = (row: Row): Row & { liningInstallDate: string | null } => {
    const source = data?.recentHeats.find((heat) => heat.id === row.id) ?? data?.activeHeats.find((heat) => heat.id === row.id);
    const liningId = source?.liningRefId ?? null;
    const lining = liningId ? liningById.get(liningId) : undefined;
    return { ...row, liningInstallDate: lining?.installedAt ?? source?.lining?.installedAt ?? null };
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4 text-slate-500" />
          Heat & Furnace Performance
        </CardTitle>
        <div className="flex items-center gap-2">
          <Link href="/steel/p05/new">
            <Button size="sm" className="gap-1.5">Select Released P04 Charge</Button>
          </Link>
          <Link href="/steel/p05/records">
            <Button variant="outline" size="sm">View All Heat Cycles</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load heat cycles." />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No heats active or completed in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="overflow-y-auto" style={{ maxHeight: `${VISIBLE_ROWS * 34 + 28}px` }}>
              <table className="w-full min-w-[1100px] text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="font-medium py-1.5 pr-3">Heat</th>
                    <th className="font-medium py-1.5 pr-3">Charge</th>
                    <th className="font-medium py-1.5 pr-3">Furnace</th>
                    <th className="font-medium py-1.5 pr-3">Lining</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Melted t</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Cycle Time</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Energy/t</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Lining Heats</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Lining Tonnes</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Efficiency</th>
                    <th className="font-medium py-1.5 pr-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((baseRow) => {
                    const r = enrichRow(baseRow);
                    const source = data?.recentHeats.find((heat) => heat.id === r.id) ?? data?.activeHeats.find((heat) => heat.id === r.id);
                    const lining = source?.liningRefId ? liningById.get(source.liningRefId) : undefined;
                    const liningHistory = source?.liningRefId ? liningHistoryById.get(source.liningRefId) : undefined;
                    return (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="py-1.5 pr-3">
                        <Link href={`/steel/p05/${r.id}`} className="font-medium text-slate-800 hover:underline">
                          {r.heatInProcessNumber}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">
                        {r.chargeNumberSnapshot ? (
                          <Link href={`/steel/p04/${r.chargePreparationId}`} className="hover:underline">
                            {r.chargeNumberSnapshot}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600">{r.furnaceCode ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-slate-600" title={r.liningInstallDate ? `Installed ${new Date(r.liningInstallDate).toLocaleDateString()}` : undefined}>
                        {r.liningCode ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-slate-700">{fmtTonnes(r.outputTonnes)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{fmtMinutes(r.cycleMinutes)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{fmtEnergyPerTonne(source && "outputEnergyTotalKwh" in source ? source.outputEnergyTotalKwh : null, r.outputTonnes)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{source?.lining?.heatsCompleted ?? lining?.heatsCompleted ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-600">{liningHistory ? `${liningHistory.totalTonnesMelted.toFixed(1)}t` : lining ? `${lining.totalTonnesMelted.toFixed(1)}t` : "—"}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-700">{r.yieldPercent === null ? "—" : `${r.yieldPercent.toFixed(1)}%`}</td>
                      <td className="py-1.5 pr-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${r.statusTone}`}>
                          {r.statusLabel}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
