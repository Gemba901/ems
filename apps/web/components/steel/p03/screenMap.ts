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

// The single 3-step workflow stepper shown at the top of every S1/S2/S3
// screen (and on /new, which previews it before an intake exists) —
// Arrival & Verification -> Material Inspection -> Weigh, Store & Release.
// This mirrors SCREENS above one-for-one; it deliberately does not expose
// the underlying A01-A14 activity codes as user-facing labels.
export const WORKFLOW_STEPS: SubStep[] = [
  { code: "S1", label: "Arrival & Verification" },
  { code: "S2", label: "Material Inspection" },
  { code: "S3", label: "Weigh, Store & Release" },
];

export function stageToScreenIndex(stage: SteelIntakeStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelIntakeStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}
