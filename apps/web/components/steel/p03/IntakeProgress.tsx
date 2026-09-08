"use client";

import { ProcessProgress, type ProcessProgressStep, type ProcessProgressStepState } from "@/components/steel/ProcessProgress";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import type { SteelMaterialIntake } from "@/services/material-intake.service";
import { stageToScreenIndex } from "./screenMap";

type StepState = ProcessProgressStepState;
type Step = ProcessProgressStep;

// Real field/allowedActions checks only — mirrors the same "done" conditions
// each S1/S2/S3 screen shell already uses for its own SubStepCard statuses,
// centralized here so the sidebar's "Intake Progress" checklist can never
// drift out of sync with what the main panel actually shows.
function buildSteps(intake: SteelMaterialIntake): Step[] {
  const actions = intake.allowedActions ?? [];
  const screenIdx = stageToScreenIndex(intake.stage);

  function state(done: boolean, active: boolean): StepState {
    if (done) return "done";
    if (active) return "active";
    return "pending";
  }

  if (screenIdx === 0) {
    return [
      { code: "A01", label: "Gate Arrival", state: "done" },
      { code: "A02", label: "Documents Verified", state: state(intake.purchaseOrderVerified !== null, actions.includes("VERIFY_DOCUMENTS")) },
      { code: "A03", label: "Gross Weight", state: state(intake.grossWeightTonnes !== null, actions.includes("RECORD_GROSS_WEIGHT")) },
      { code: "A04", label: "Safety Check", state: state(intake.safetyCheckPassed !== null, actions.includes("RECORD_SAFETY_CHECK")) },
    ];
  }

  if (screenIdx === 1) {
    if (intake.status === "REJECTED") {
      return [
        { code: "A05", label: "Area Assigned", state: "done" },
        { code: "A06–A09", label: "Material Inspection", state: "done" },
        { code: "A10", label: "Acceptance Decision", state: "blocked", note: "Rejected" },
      ];
    }
    const inspectionDone = intake.visualInspectionNotes !== null || intake.materialType !== null || intake.acceptanceDecision !== null;
    const decisionDone = intake.acceptanceDecision !== null && !actions.includes("RECORD_ACCEPTANCE_DECISION");
    return [
      { code: "A05", label: "Area Assigned", state: state(intake.unloadingArea !== null, actions.includes("ASSIGN_UNLOADING_AREA")) },
      { code: "A06–A09", label: "Material Inspection", state: state(inspectionDone, actions.includes("RECORD_INSPECTION")) },
      {
        code: "A10",
        label: "Acceptance Decision",
        state: state(decisionDone, actions.includes("RECORD_ACCEPTANCE_DECISION")),
        note: intake.status === "ON_HOLD" ? "On hold — re-decision needed" : undefined,
      },
    ];
  }

  const released = intake.status === "RELEASED";
  if (intake.acceptanceDecision !== "ACCEPT" && !released) {
    return [
      { code: "A11", label: "Unloaded", state: "blocked", note: "Not accepted" },
      { code: "A12", label: "Net Weight", state: "blocked" },
      { code: "A13", label: "Yard Stored", state: "blocked" },
      { code: "A14", label: "Stock Released", state: "blocked" },
    ];
  }
  return [
    { code: "A11", label: "Unloaded", state: state(intake.unloadedAt !== null, actions.includes("RECORD_UNLOADING")) },
    { code: "A12", label: "Net Weight", state: state(intake.netWeightTonnes !== null, actions.includes("RECORD_NET_WEIGHT")) },
    { code: "A13", label: "Yard Stored", state: state(intake.yardLocation !== null, actions.includes("ASSIGN_YARD_LOCATION")) },
    { code: "A14", label: "Stock Released", state: state(released, actions.includes("RELEASE_TO_STOCK")) },
  ];
}

// Persistent "current screen" checklist — distinct from the top WorkflowIndicator
// (which shows S1/S2/S3 only). This answers "where exactly am I within this
// screen" without exposing A01-A14 as the primary navigation taxonomy.
// Rendering is delegated to the shared ProcessProgress; all real
// done/active/pending/blocked calculation stays here in buildSteps(),
// unchanged.
export function IntakeProgress({ intake }: { intake: SteelMaterialIntake }) {
  const steps = buildSteps(intake);
  const activeColorBar = STEEL_PROCESSES.find((p) => p.code === "P03")?.color.bar;

  return <ProcessProgress title="Intake Progress" steps={steps} activeColorBar={activeColorBar} />;
}
