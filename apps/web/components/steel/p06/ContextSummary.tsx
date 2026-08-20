"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelHeatApproval } from "@/services/steel-heat-approval.service";

interface Props {
  heatApproval: SteelHeatApproval;
}

// Persistent, read-only melting context shown across all P06 S1-S3
// screens — answers "which heat is this chemistry approval for." Mirrors
// components/steel/p05/ContextSummary.tsx.
export function ContextSummary({ heatApproval }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Heat Context</CardTitle>
        <p className="text-sm text-slate-500">From P05 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Heat-in-Process No.</p>
            <p className="font-medium text-slate-800">{heatApproval.melting?.heatInProcessNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Charge ID</p>
            <p className="font-medium text-slate-800">{heatApproval.melting?.chargeNumberSnapshot ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Approval No.</p>
            <p className="font-medium text-slate-800">{heatApproval.approvalNumber}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
