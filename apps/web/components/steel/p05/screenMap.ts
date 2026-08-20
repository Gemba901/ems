import type { SteelMeltingStage } from "@/services/steel-melting.service";

// Single source of truth for the P05 melting workflow screens (S1-S3), each
// grouping a contiguous run of the real 14-activity backend state machine.
// Nothing here changes stage semantics — MELTING_STAGE_ORDER in
// steel-melting.service.ts remains authoritative for sequencing; this only
// maps stages to the screen a user would associate them with. Mirrors the
// pattern established in components/steel/p04/screenMap.ts.
export interface ScreenMeta {
  code: string;
  label: string;
  stages: SteelMeltingStage[];
}

export const SCREENS: ScreenMeta[] = [
  {
    code: "S1",
    label: "Furnace Readiness & Charge Verification",
    stages: [
      "A01_CONFIRM_FURNACE_AVAILABILITY",
      "A02_FURNACE_LINING_CHECK",
      "A03_FURNACE_SYSTEMS_CHECK",
      "A04_PREVIOUS_HEAT_READINESS",
      "A05_VERIFY_CHARGE_RECIPE",
    ],
  },
  {
    code: "S2",
    label: "Charging & Melting Operation",
    stages: ["A06_LOAD_CHARGE", "A07_START_MELTING", "A08_MONITOR_POWER", "A09_MONITOR_TEMPERATURE"],
  },
  {
    code: "S3",
    label: "Melt Completion & Handover",
    stages: [
      "A10_RECORD_ADDITIONS",
      "A11_REMOVE_SLAG",
      "A12_RECORD_MELT_OUTPUT",
      "A13_CONFIRM_LIQUID_READY",
      "A14_HANDOVER_TO_REFINING",
    ],
  },
];

export const SCREEN_LABELS: string[] = SCREENS.map((s) => s.label);

export function stageToScreenIndex(stage: SteelMeltingStage): number {
  return SCREENS.findIndex((s) => s.stages.includes(stage));
}

export function stageToScreen(stage: SteelMeltingStage): ScreenMeta {
  return SCREENS[stageToScreenIndex(stage)] ?? SCREENS[0];
}

export interface SubStep {
  code: string;
  label: string;
}

// Compact sub-step labels for the horizontal stepper shown at the top of
// each S1/S2/S3 screen — same pattern as P04's SCREEN_TOP_STEPS. Purely a
// page-level visual affordance; still only ever groups the real A01-A14
// activities.
export const SCREEN_TOP_STEPS: SubStep[][] = [
  [
    { code: "A01", label: "Furnace Availability" },
    { code: "A02", label: "Lining Check" },
    { code: "A03", label: "Systems Check" },
    { code: "A04", label: "Previous Heat" },
    { code: "A05", label: "Charge Verification" },
  ],
  [
    { code: "A06", label: "Load Charge" },
    { code: "A07", label: "Start Melting" },
    { code: "A08", label: "Power Monitoring" },
    { code: "A09", label: "Temperature Monitoring" },
  ],
  [
    { code: "A10-A11", label: "Additions & Slag" },
    { code: "A12", label: "Melt Output" },
    { code: "A13", label: "Liquid Ready" },
    { code: "A14", label: "Refining Handover" },
  ],
];

// Single continuous stepper for the consolidated Heat Input/Operations
// screen (S1+S2, A01-A09) — same activities as SCREEN_TOP_STEPS[0] and [1]
// concatenated, just rendered as one 9-step indicator instead of two.
export const HEAT_OPERATIONS_STEPS: SubStep[] = [...SCREEN_TOP_STEPS[0], ...SCREEN_TOP_STEPS[1]];

// Visual tab grouping for the Heat Input/Operations workspace — purely a
// presentation grouping of the real A01-A09 activities by operational
// purpose; does not change stage sequencing or gating (still driven by
// melting.allowedActions / subStatus() per activity).
export const HEAT_OPERATIONS_TABS = [
  { key: "overview", label: "Overview" },
  { key: "materials", label: "Materials / Charge" },
  { key: "temperature", label: "Temperature" },
  { key: "power", label: "Power" },
  { key: "events", label: "Events" },
] as const;

export type HeatOperationsTabKey = (typeof HEAT_OPERATIONS_TABS)[number]["key"];
