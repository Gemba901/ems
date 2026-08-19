"use client";

import Link from "next/link";
import { Loader2, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard, DashboardFurnaceStatus } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// Furnace.status is the real Prisma enum (READY | MAINTENANCE | DOWN |
// RETIRED) — no "RUNNING" status exists in the schema, so an active heat is
// shown as separate, derived information rather than invented as a status.
const STATUS_STYLES: Record<string, string> = {
  READY: "bg-emerald-50 text-emerald-700",
  MAINTENANCE: "bg-amber-50 text-amber-700",
  DOWN: "bg-red-50 text-red-700",
  RETIRED: "bg-slate-100 text-slate-500",
};

function FurnaceRow({ furnace }: { furnace: DashboardFurnaceStatus }) {
  const content = (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-sm px-4 py-3 transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{furnace.code} — {furnace.name}</p>
        </div>
        <Badge className={STATUS_STYLES[furnace.status] ?? "bg-slate-100 text-slate-600"}>{furnace.status}</Badge>
      </div>
      {furnace.activeHeat ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-400 block">Current Heat</span>
            <span className="font-medium text-slate-700">{furnace.activeHeat.heatInProcessNumber}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Current Temperature</span>
            <span className="font-medium text-slate-700">{furnace.activeHeat.temperatureCelsius !== null ? `${furnace.activeHeat.temperatureCelsius}°C` : "—"}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No active heat</p>
      )}
      {furnace.lining && (
        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-50">
          <div>
            <span className="text-slate-400 block">Lining</span>
            <span className="font-medium text-slate-700">{furnace.lining.id.slice(0, 8)}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Heats on Lining</span>
            <span className="font-medium text-slate-700">{furnace.lining.heatsCompleted}</span>
          </div>
        </div>
      )}
    </div>
  );

  return furnace.activeHeat ? (
    <Link href={`/steel/p05/${furnace.activeHeat.id}`}>{content}</Link>
  ) : (
    content
  );
}

export function FurnaceStatusPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-red-500" />
          Furnace Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load furnace status." />
        ) : !data || data.furnaceStatus.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No furnaces set up yet.</p>
        ) : (
          data.furnaceStatus.map((f) => <FurnaceRow key={f.id} furnace={f} />)
        )}
      </CardContent>
    </Card>
  );
}
