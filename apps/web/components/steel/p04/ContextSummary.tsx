"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelChargePreparation } from "@/services/steel-charge-preparation.service";

interface Props {
  prep: SteelChargePreparation;
}

// Persistent, read-only production-plan context shown across all P04
// S1-S3 screens — answers "what plan is this charge being prepared for."
// Only real fields already returned on the charge preparation's embedded
// `plan` relation are shown (planNumber, status) — richer plan fields
// (customer/product/quantity) aren't included in that relation today, so
// they're simply omitted rather than invented or fetched separately.
export function ContextSummary({ prep }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Plan Context</CardTitle>
        <p className="text-sm text-slate-500">From P01 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Production Plan</p>
            <p className="font-medium text-slate-800">{prep.plan?.planNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Plan Status</p>
            <p className="font-medium text-slate-800">{prep.plan?.status ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Preparation Number</p>
            <p className="font-medium text-slate-800">{prep.prepNumber}</p>
          </div>
          {prep.chargeNumber && (
            <div>
              <p className="text-xs text-slate-400">Charge ID</p>
              <p className="font-medium text-slate-800">{prep.chargeNumber}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
