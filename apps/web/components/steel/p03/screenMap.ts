import type { SteelIntakeStage } from "@/services/material-intake.service";

// Single source of truth for the P03 material-intake workflow screens
// (S1-S3), each grouping a contiguous run of the real 14-activity backend
// state machine. Nothing here changes stage semantics — INTAKE_STAGE_ORDER
// in material-intake.service.ts remains authoritative for sequencing; this
// only maps stages to the screen a user would associate them with. Mirrors
// the pattern established in components/steel/p02/screenMap.ts.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelIntakeStage[];
}

export const SCREENS: ScreenMeta[] = [
  {
    code: "S1",
    label: "Gate & Documents",
    stages: ["A01_GATE_ARRIVAL_RECORDED", "A02_DOCUMENTS_VERIFIED", "A03_GROSS_WEIGHT_CAPTURED", "A04_SAFETY_CHECKED"],
  },
  {
    code: "S2",
    label: "Inspection & Acceptance",
    stages: [
      "A05_AREA_ASSIGNED",
      "A06_VISUAL_INSPECTED",
      "A07_HAZARD_CHECKED",
      "A08_RADIATION_CHECKED",
      "A09_CERTIFICATE_VERIFIED",
      "A10_ACCEPTANCE_DECIDED",
    ],
  },
  {
    code: "S3",
    label: "Unloading, Storage & Release",
    stages: ["A11_UNLOADED", "A12_NET_WEIGHT_CAPTURED", "A13_YARD_STORED", "A14_STOCK_RELEASED"],
  },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

export interface SubStep {
  code: string;
  label: string;
}

// Compact sub-step labels for the horizontal stepper shown at the top of
// each S1/S2/S3 screen (and on /new, which previews S1's stepper before an
// intake exists). Deliberately shorter than the sidebar Intake Progress
// card's labels — this is a page-level visual affordance, not a second
// stage taxonomy; it still only ever groups the real A01-A14 activities.
export const SCREEN_TOP_STEPS: SubStep[][] = [
  [
    { code: "A01", label: "Gate Arrival" },
    { code: "A02", label: "Documents" },
    { code: "A03", label: "Weigh In" },
    { code: "A04", label: "Safety Check" },
  ],
  [
    { code: "A05", label: "Area Assigned" },
    { code: "A06-A09", label: "Inspection" },
    { code: "A10", label: "Acceptance" },
  ],
  [
    { code: "A11", label: "Unloading" },
    { code: "A12", label: "Net Weight" },
    { code: "A13", label: "Yard Stored" },
    { code: "A14", label: "Stock Release" },
  ],
];

export function stageToScreenIndex(stage: SteelIntakeStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelIntakeStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}
