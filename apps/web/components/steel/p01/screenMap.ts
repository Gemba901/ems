import type { SteelPlanStage } from "@/services/steel.service";

// Single source of truth for the P01 6-screen workflow (S1-S6), each
// grouping a contiguous run of the real 12-stage backend state machine.
// Nothing here changes stage semantics — STAGE_ORDER in steel.service.ts
// remains authoritative for sequencing; this only maps stages to the
// screen a user would associate them with.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelPlanStage[];
}

export const SCREENS: ScreenMeta[] = [
  { code: "S1", label: "Demand & Priority", stages: ["A01_DEMAND_CAPTURED", "A02_PRIORITY_CONFIRMED"] },
  { code: "S2", label: "Product & Specification", stages: ["A03_PRODUCT_CONFIRMED", "A04_SPEC_CONFIRMED"] },
  { code: "S3", label: "Stock & Fulfilment", stages: ["A05_STOCK_CHECKED", "A06_STOCK_DECISION_MADE"] },
  {
    code: "S4",
    label: "Feasibility & Route Planning",
    stages: ["A07_ROUTE_SELECTED", "A08_MATERIAL_CHECKED", "A09_CAPACITY_CHECKED"],
  },
  { code: "S5", label: "Plan Preparation & Communication", stages: ["A10_PLAN_DRAFTED", "A11_PLAN_COMMUNICATED"] },
  { code: "S6", label: "Plan Release", stages: ["A12_PLAN_RELEASED"] },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

// Which screen "owns" a given stage, i.e. the screen whose activities
// include that stage. Used for display/mapping purposes (dashboard,
// indicators) — not for routing decisions, which also depend on
// in-progress sub-step and acknowledgement state that this map doesn't
// capture.
export function stageToScreenIndex(stage: SteelPlanStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelPlanStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}
