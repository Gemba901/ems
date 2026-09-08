"use client";

import type { SteelChargePreparation } from "@/services/steel-charge-preparation.service";
import { CHARGE_STAGE_ORDER } from "@/services/steel-charge-preparation.service";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { ProcessProgress, type ProcessProgressStep, type ProcessProgressStepState } from "@/components/steel/ProcessProgress";
import { stageToScreenIndex } from "./screenMap";

type Step = ProcessProgressStep;
type StepState = ProcessProgressStepState;

// Real field/allowedActions checks only — mirrors the same "done" conditions
// each S1/S2/S3 screen shell already uses for its own SubStepCard statuses,
// centralized here so the sidebar's progress checklist can never drift out
// of sync with what the main panel actually shows. Mirrors
// components/steel/p03/IntakeProgress.tsx.
function buildSteps(prep: SteelChargePreparation): Step[] {
  const actions = prep.allowedActions ?? [];
  const screenIdx = stageToScreenIndex(prep.stage);
  const stageIdx = CHARGE_STAGE_ORDER.indexOf(prep.stage);

  function state(done: boolean, active: boolean): StepState {
    if (done) return "done";
    if (active) return "active";
    return "pending";
  }

  if (screenIdx === 0) {
    return [
      { code: "A01", label: "Requirement Reviewed", state: "done" },
      { code: "A02", label: "Material Lots Selected", state: state(prep.materialLots.length > 0, actions.includes("SELECT_LOTS")) },
    ];
  }

  if (screenIdx === 1) {
    return [
      { code: "A03", label: "Scrap Sorted", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A03_SCRAP_SORTED"), actions.includes("RECORD_SCRAP_SORTING")) },
      { code: "A04", label: "Scrap Cut", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A04_SCRAP_CUT"), actions.includes("RECORD_SCRAP_CUTTING")) },
      { code: "A05", label: "Contaminants Removed", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A05_CONTAMINANTS_REMOVED"), actions.includes("REMOVE_CONTAMINANTS")) },
      { code: "A06", label: "Additives Prepared", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A06_ADDITIVES_PREPARED"), actions.includes("PREPARE_ADDITIVES")) },
      { code: "A07", label: "Return Scrap Checked", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A07_RETURN_SCRAP_CHECKED"), actions.includes("CHECK_RETURN_SCRAP")) },
      { code: "A08", label: "Recipe Prepared", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A08_RECIPE_PREPARED"), actions.includes("PREPARE_RECIPE")) },
      { code: "A09", label: "Material Staged", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A09_MATERIAL_STAGED"), actions.includes("STAGE_MATERIAL")) },
    ];
  }

  const released = !!prep.chargeNumber;
  const closed = prep.status === "CLOSED";
  return [
    { code: "A10", label: "Material Verified", state: state(stageIdx >= CHARGE_STAGE_ORDER.indexOf("A10_VERIFICATION_DONE"), actions.includes("VERIFY_MATERIAL")) },
    {
      code: "A11",
      label: "Charge ID Released",
      state: state(released, actions.includes("RELEASE_CHARGE")),
      note: prep.weightVarianceTonnes !== null && prep.weightVarianceTonnes !== 0 && !prep.varianceApproved ? "Waiting on variance approval" : undefined,
    },
    { code: "A12", label: "Furnace Handover Closed", state: state(closed, actions.includes("CLOSE_HANDOVER")) },
  ];
}

// Persistent "current screen" checklist — distinct from the top
// WorkflowIndicator (which shows S1/S2/S3 sub-step labels only). Answers
// "where exactly am I within this screen" without exposing A01-A12 as the
// primary navigation taxonomy. Rendering is delegated to the shared
// ProcessProgress; all real done/active/pending/blocked calculation stays
// here in buildSteps(), unchanged.
export function ChargeProgress({ prep }: { prep: SteelChargePreparation }) {
  const steps = buildSteps(prep);
  const activeColorBar = STEEL_PROCESSES.find((p) => p.code === "P04")?.color.bar;
  const statusNote =
    prep.status === "ON_HOLD"
      ? "This preparation is on hold — no further progress until it resumes."
      : prep.status === "CANCELLED"
        ? "This preparation was cancelled."
        : undefined;

  return (
    <ProcessProgress title="Preparation Progress" steps={steps} activeColorBar={activeColorBar} statusNote={statusNote} />
  );
}
