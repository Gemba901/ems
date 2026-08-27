"use client";

import { Activity, Flame, Layers3, Loader2, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: LucideIcon }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
        <span className={`h-5 w-5 shrink-0 rounded flex items-center justify-center ${tone}`}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/**
 * Compact dashboard KPIs. Target tonnage comes from the P04 recipe
 * snapshot, while energy per tonne uses persisted output energy divided by
 * persisted output tonnes from completed heats.
 */
export function ProductionTargetPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  if (isError) {
    return (
      <Card>
        <CardContent>
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load production target." />
        </CardContent>
      </Card>
    );
  }

  const kpis = isLoading || !data ? null : data.kpis;
  const target = kpis?.plannedChargeTonnes ?? null;
  const actual = kpis?.totalOutputTonnes ?? null;
  const currentLiningTonnes = data?.liningStatus.length
    ? data.liningStatus.reduce((total, lining) => total + lining.totalTonnesMelted, 0)
    : null;
  const energyTotals = data?.recentHeats.reduce(
    (totals, heat) => {
      if (heat.outputEnergyTotalKwh !== null && heat.output !== null && heat.output > 0) {
        totals.energyKwh += heat.outputEnergyTotalKwh;
        totals.tonnes += heat.output;
      }
      return totals;
    },
    { energyKwh: 0, tonnes: 0 },
  );
  const averageEnergyPerTonne = energyTotals && energyTotals.tonnes > 0 ? energyTotals.energyKwh / energyTotals.tonnes : null;

  return (
    <Card>
      <CardContent className="py-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Production Target" value={target !== null ? `${target.toFixed(1)} t` : "Unavailable"} tone="bg-blue-50 text-blue-700" icon={Target} />
            <Stat label="Melted / Produced" value={actual !== null ? `${actual.toFixed(1)} t` : "Unavailable"} tone="bg-emerald-50 text-emerald-700" icon={Activity} />
            <Stat label="Remaining" value={target !== null && actual !== null ? `${Math.max(0, target - actual).toFixed(1)} t` : "Unavailable"} tone="bg-amber-50 text-amber-700" icon={Target} />
            <Stat label="Active Heats" value={kpis ? String(kpis.activeHeats) : "Unavailable"} tone="bg-orange-50 text-orange-700" icon={Flame} />
            <Stat label="Current Lining Tonnes" value={currentLiningTonnes !== null ? `${currentLiningTonnes.toFixed(1)} t` : "Unavailable"} tone="bg-violet-50 text-violet-700" icon={Layers3} />
            <Stat label="Avg Energy / t" value={averageEnergyPerTonne !== null ? `${averageEnergyPerTonne.toFixed(0)} kWh/t` : "Unavailable"} tone="bg-cyan-50 text-cyan-700" icon={Zap} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
