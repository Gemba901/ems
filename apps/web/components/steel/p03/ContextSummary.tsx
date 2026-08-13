"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelMaterialIntake } from "@/services/material-intake.service";
import type { SteelSourcingOrder } from "@/services/steel-sourcing.service";

interface Props {
  intake: SteelMaterialIntake;
  /** The full P02 sourcing order, fetched separately — richer fields (PO
   * number/quantity/price/terms) aren't included on the intake's own
   * embedded sourcingOrder object. Optional: falls back gracefully to only
   * the lighter embedded fields while this is loading or unavailable. */
  sourcingOrder?: SteelSourcingOrder;
}

// Persistent, read-only P02 context shown across all P03 S1-S3 screens —
// answers "what am I receiving, from where, under which PO" without
// re-exposing any of P02's own editable fields. Only real fields are shown;
// anything not present on either object is simply omitted.
export function ContextSummary({ intake, sourcingOrder }: Props) {
  const material = intake.materialType ?? intake.sourcingOrder.materialType;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Order Context</CardTitle>
        <p className="text-sm text-slate-500">From P02 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Sourcing Order</p>
            <p className="font-medium text-slate-800">{intake.sourcingOrder.sourcingNumber}</p>
          </div>
          {intake.sourcingOrder.plan?.planNumber && (
            <div>
              <p className="text-xs text-slate-400">Production Plan</p>
              <p className="font-medium text-slate-800">{intake.sourcingOrder.plan.planNumber}</p>
            </div>
          )}
          {intake.sourcingOrder.supplier?.name && (
            <div>
              <p className="text-xs text-slate-400">Supplier</p>
              <p className="font-medium text-slate-800">{intake.sourcingOrder.supplier.name}</p>
            </div>
          )}
          {material && (
            <div>
              <p className="text-xs text-slate-400">Material Type</p>
              <p className="font-medium text-slate-800">{material.replace(/_/g, " ")}</p>
            </div>
          )}
          {sourcingOrder?.poNumber && (
            <div>
              <p className="text-xs text-slate-400">PO Number</p>
              <p className="font-medium text-slate-800">{sourcingOrder.poNumber}</p>
            </div>
          )}
          {sourcingOrder?.poQuantity != null && (
            <div>
              <p className="text-xs text-slate-400">PO Quantity</p>
              <p className="font-medium text-slate-800">{sourcingOrder.poQuantity}</p>
            </div>
          )}
          {sourcingOrder?.poPrice != null && (
            <div>
              <p className="text-xs text-slate-400">PO Price</p>
              <p className="font-medium text-slate-800">{sourcingOrder.poPrice} {sourcingOrder.poCurrency}</p>
            </div>
          )}
          {sourcingOrder?.poDeliveryTerms && (
            <div>
              <p className="text-xs text-slate-400">PO Terms</p>
              <p className="font-medium text-slate-800">{sourcingOrder.poDeliveryTerms}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
