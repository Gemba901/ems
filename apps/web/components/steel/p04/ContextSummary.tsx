"use client";

import { ContextSummary as SharedContextSummary } from "@/components/steel/ContextSummary";
import type { SteelChargePreparation } from "@/services/steel-charge-preparation.service";

interface Props {
  prep: SteelChargePreparation;
}

// Thin P04-specific wrapper around the shared ContextSummary — preserves
// the exact `{ prep }` call signature every S1-S3 screen already uses,
// while delegating rendering to the canonical component. Same fields as
// before: only what the charge preparation's embedded `plan` relation
// actually returns (planNumber, status) — richer plan fields aren't
// fetched or invented.
export function ContextSummary({ prep }: Props) {
  return (
    <SharedContextSummary
      title="Production Plan Context"
      subtitle="From P01 — read only."
      fields={[
        { label: "Production Plan", value: prep.plan?.planNumber ?? "—" },
        { label: "Plan Status", value: prep.plan?.status ?? "—" },
        { label: "Preparation Number", value: prep.prepNumber },
        { label: "Charge ID", value: prep.chargeNumber },
      ]}
    />
  );
}
