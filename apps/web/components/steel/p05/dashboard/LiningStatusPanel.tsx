"use client";

import { Loader2, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import type { MeltingDashboard } from "@/services/steel-melting.service";

interface Props {
  data?: MeltingDashboard;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

// Deliberately does NOT compute or label a "lining efficiency" figure — no
// business-approved formula exists. Shows only stored measurements: heats
// completed, condition/notes, and remaining thickness where recorded.
export function LiningStatusPanel({ data, isLoading, isError, isFetching, onRetry }: Props) {
  const rows = data?.liningStatus ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-500" />
          Lining Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry ?? (() => {})} isRetrying={isFetching} message="Could not load lining status." />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No active linings recorded.</p>
        ) : (
          rows.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{l.furnaceCode}</p>
                <p className="text-xs text-slate-400">
                  Installed {new Date(l.installedAt).toLocaleDateString()}
                  {l.thicknessRemainingMm !== null ? ` · ${l.thicknessRemainingMm}mm remaining` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-slate-900">{l.heatsCompleted} heats</p>
                <Badge className={l.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                  {l.condition || l.status}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
