import type { SteelHeatApprovalStage } from "@/services/steel-heat-approval.service";

// Single source of truth for the P06 heat-approval workflow screens
// (S1-S3), each grouping a contiguous run of the real 13-activity backend
// state machine. Nothing here changes stage semantics —
// HEAT_APPROVAL_STAGE_ORDER in steel-heat-approval.service.ts remains
// authoritative for sequencing; this only maps stages to the screen a user
// would associate them with. Mirrors components/steel/p05/screenMap.ts.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelHeatApprovalStage[];
}

export const SCREENS: ScreenMeta[] = [
  {
    code: "S1",
    label: "Chemistry Sampling & Correction",
    stages: [
      "A01_TAKE_SAMPLE",
      "A02_ANALYZE_SAMPLE",
      "A03_COMPARE_CHEMISTRY",
      "A04_DECIDE_CORRECTION",
      "A05_ADD_CORRECTION_MATERIAL",
      "A06_RETEST_CHEMISTRY",
    ],
  },
  {
    code: "S2",
    label: "Temperature & Ladle Readiness",
    stages: ["A07_CHECK_TEMPERATURE", "A08_CHECK_LADLE_READINESS"],
  },
  {
    code: "S3",
    label: "Approval, Tapping & Release",
    stages: [
      "A09_APPROVE_CHEMISTRY_TEMPERATURE",
      "A10_CONFIRM_HEAT_NUMBER",
      "A11_TAPPING_APPROVAL",
      "A12_TAP_TO_LADLE",
      "A13_RELEASE_TO_CASTING",
    ],
  },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

export function stageToScreenIndex(stage: SteelHeatApprovalStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelHeatApprovalStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}

export interface SubStep {
  code: string;
  label: string;
}

// Compact sub-step labels for the horizontal stepper shown at the top of
// each S1/S2/S3 screen — same pattern as P05's SCREEN_TOP_STEPS. Purely a
// page-level visual affordance; still only ever groups the real A01-A13
// activities.
export const SCREEN_TOP_STEPS: SubStep[][] = [
  [
    { code: "A01", label: "Sample Taken" },
    { code: "A02", label: "Sample Analyzed" },
    { code: "A03", label: "Chemistry Compared" },
    { code: "A04", label: "Correction Decided" },
    { code: "A05", label: "Correction Material" },
    { code: "A06", label: "Re-test Chemistry" },
  ],
  [
    { code: "A07", label: "Temperature Check" },
    { code: "A08", label: "Ladle Readiness" },
  ],
  [
    { code: "A09", label: "Chemistry & Temp Approval" },
    { code: "A10", label: "Heat Number" },
    { code: "A11", label: "Tapping Approval" },
    { code: "A12", label: "Tap to Ladle" },
    { code: "A13", label: "Release to Casting" },
  ],
];
