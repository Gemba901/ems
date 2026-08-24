import type { SteelPlanStage } from "@/services/steel.service";

// P01's UI is two screens (Create Planning Document, Planning Document) —
// the create form runs A01-A11 in one submission, so these "screens" are no
// longer distinct workflow steps a planner clicks through. This grouping is
// kept only as a stage-distribution taxonomy for the plans list/dashboard
// (ProductionPlanList, StageOverview), grouping the real 12-stage backend
// state machine into readable phases. Nothing here changes stage semantics —
// STAGE_ORDER in steel.service.ts remains authoritative for sequencing.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelPlanStage[];
}

export const SCREENS: ScreenMeta[] = [
  {
    code: "S1",
    label: "Demand & Requirement",
    stages: ["A01_DEMAND_CAPTURED", "A02_PRIORITY_CONFIRMED", "A03_PRODUCT_CONFIRMED", "A04_SPEC_CONFIRMED"],
  },
  {
    code: "S2",
    label: "Fulfilment & Feasibility",
    stages: [
      "A05_STOCK_CHECKED",
      "A06_STOCK_DECISION_MADE",
      "A07_ROUTE_SELECTED",
      "A08_MATERIAL_CHECKED",
      "A09_CAPACITY_CHECKED",
    ],
  },
  { code: "S3", label: "Build Plan", stages: ["A10_PLAN_DRAFTED", "A11_PLAN_COMMUNICATED"] },
  { code: "S4", label: "Review & Release", stages: ["A12_PLAN_RELEASED"] },
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
