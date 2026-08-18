"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelMelting } from "@/services/steel-melting.service";

interface Props {
  melting: SteelMelting;
}

// Persistent, read-only charge-preparation context shown across all P05
// S1-S3 screens — answers "which released charge is this heat being melted
// from." Mirrors components/steel/p04/ContextSummary.tsx.
export function ContextSummary({ melting }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge Context</CardTitle>
        <p className="text-sm text-slate-500">From P04 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Charge Preparation</p>
            <p className="font-medium text-slate-800">{melting.chargePreparation?.prepNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Charge ID</p>
            <p className="font-medium text-slate-800">{melting.chargeNumberSnapshot ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Heat-in-Process No.</p>
            <p className="font-medium text-slate-800">{melting.heatInProcessNumber}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
