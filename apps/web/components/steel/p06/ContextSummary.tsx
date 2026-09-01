"use client";

import { ContextSummary as SharedContextSummary } from "@/components/steel/ContextSummary";
import type { SteelHeatApproval } from "@/services/steel-heat-approval.service";

interface Props {
  heatApproval: SteelHeatApproval;
}

// Thin P06-specific wrapper around the shared ContextSummary — preserves
// the exact `{ heatApproval }` call signature every S1-S3 screen already
// uses, while delegating rendering to the canonical component.
export function ContextSummary({ heatApproval }: Props) {
  return (
    <SharedContextSummary
      title="Heat Context"
      subtitle="From P05 — read only."
      fields={[
        { label: "Heat-in-Process No.", value: heatApproval.melting?.heatInProcessNumber ?? "—" },
        { label: "Charge ID", value: heatApproval.melting?.chargeNumberSnapshot ?? "—" },
        { label: "Approval No.", value: heatApproval.approvalNumber },
      ]}
    />
  );
}
