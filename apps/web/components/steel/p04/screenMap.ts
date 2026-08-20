import type { SteelChargeStage } from "@/services/steel-charge-preparation.service";

// Single source of truth for the P04 charge-preparation workflow screens
// (S1-S3), each grouping a contiguous run of the real 12-activity backend
// state machine. Nothing here changes stage semantics — CHARGE_STAGE_ORDER
// in steel-charge-preparation.service.ts remains authoritative for
// sequencing; this only maps stages to the screen a user would associate
// them with. Mirrors the pattern established in components/steel/p03/screenMap.ts.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelChargeStage[];
}

export const SCREENS: ScreenMeta[] = [
  {
    code: "S1",
    label: "Requirement & Material Selection",
    stages: ["A01_REQUIREMENT_REVIEWED", "A02_LOTS_SELECTED"],
  },
  {
    code: "S2",
    label: "Material Preparation",
    stages: [
      "A03_SCRAP_SORTED",
      "A04_SCRAP_CUT",
      "A05_CONTAMINANTS_REMOVED",
      "A06_ADDITIVES_PREPARED",
      "A07_RETURN_SCRAP_CHECKED",
      "A08_RECIPE_PREPARED",
      "A09_MATERIAL_STAGED",
    ],
  },
  {
    code: "S3",
    label: "Verification & Release",
    stages: ["A10_VERIFICATION_DONE", "A11_CHARGE_RELEASED", "A12_HANDOVER_CLOSED"],
  },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

export function stageToScreenIndex(stage: SteelChargeStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelChargeStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}

export interface SubStep {
  code: string;
  label: string;
}

// Compact sub-step labels for the horizontal stepper shown at the top of
// each S1/S2/S3 screen — same pattern as P03's SCREEN_TOP_STEPS. Purely a
// page-level visual affordance; still only ever groups the real A01-A12
// activities.
export const SCREEN_TOP_STEPS: SubStep[][] = [
  [
    { code: "A01", label: "Requirement" },
    { code: "A02", label: "Material Selection" },
  ],
  [
    { code: "A03", label: "Sorting" },
    { code: "A04-A05", label: "Cutting & Cleanup" },
    { code: "A06-A07", label: "Additives & Return Scrap" },
    { code: "A08-A09", label: "Recipe & Staging" },
  ],
  [
    { code: "A10", label: "Verification" },
    { code: "A11", label: "Charge Release" },
    { code: "A12", label: "Furnace Handover" },
  ],
];
