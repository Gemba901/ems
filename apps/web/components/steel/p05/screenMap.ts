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
