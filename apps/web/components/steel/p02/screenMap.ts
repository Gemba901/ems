import type { SteelSourcingStage } from "@/services/steel-sourcing.service";

// Single source of truth for the P02 sourcing workflow screens (S1-S5), each
// grouping a contiguous run of the real 12-stage backend state machine.
// Nothing here changes stage semantics — SOURCING_STAGE_ORDER in
// steel-sourcing.service.ts remains authoritative for sequencing; this only
// maps stages to the screen a user would associate them with.
//
// S1 is a standalone creation route (app/steel/p02/new); S2-S5 are the
// app/steel/p02/[id] screens. Used by the shared WorkflowIndicator to render
// the full S1-S5 strip. Mirrors the pattern established in
// components/steel/p01/screenMap.ts.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelSourcingStage[];
}

export const SCREENS: ScreenMeta[] = [
  { code: "S1", label: "Requirement", stages: ["A01_REQUIREMENT_REVIEWED", "A02_MATERIAL_TYPE_IDENTIFIED"] },
  { code: "S2", label: "Supplier", stages: ["A03_SUPPLIER_CHECKED", "A04_SUPPLIER_RISK_REVIEWED"] },
  { code: "S3", label: "Sourcing", stages: ["A05_QUOTATIONS_COLLECTED", "A06_SUPPLIER_SELECTED"] },
  { code: "S4", label: "PO", stages: ["A07_SPEC_CONFIRMED", "A08_PO_CREATED"] },
  {
    code: "S5",
    label: "Handover",
    stages: ["A09_DELIVERY_CONFIRMED", "A10_LOGISTICS_PREPARED", "A11_INTAKE_INFORMED", "A12_HANDOVER_CLOSED"],
  },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

export function stageToScreenIndex(stage: SteelSourcingStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelSourcingStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}
