"use client";

import { ContextSummary as SharedContextSummary } from "@/components/steel/ContextSummary";
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

// Thin P03-specific wrapper around the shared ContextSummary — preserves
// the exact `{ intake, sourcingOrder }` call signature every S1-S3 screen
// already uses. Only real fields are shown; anything not present on either
// object is simply omitted (SharedContextSummary already drops
// null/undefined/empty field values).
export function ContextSummary({ intake, sourcingOrder }: Props) {
  const material = intake.materialType ?? intake.sourcingOrder.materialType;

  return (
    <SharedContextSummary
      title="Sourcing Order Context"
      subtitle="From P02 — read only."
      fields={[
        { label: "Sourcing Order", value: intake.sourcingOrder.sourcingNumber },
        { label: "Production Plan", value: intake.sourcingOrder.plan?.planNumber },
        { label: "Supplier", value: intake.sourcingOrder.supplier?.name },
        { label: "Material Type", value: material?.replace(/_/g, " ") },
        { label: "PO Number", value: sourcingOrder?.poNumber },
        { label: "PO Quantity", value: sourcingOrder?.poQuantity },
        { label: "PO Price", value: sourcingOrder?.poPrice != null ? `${sourcingOrder.poPrice} ${sourcingOrder.poCurrency}` : undefined },
        { label: "PO Terms", value: sourcingOrder?.poDeliveryTerms },
      ]}
    />
  );
}
