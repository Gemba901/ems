"use client";

import { ProcessProgress, type ProcessProgressStep, type ProcessProgressStepState } from "@/components/steel/ProcessProgress";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import type { SteelHeatApproval } from "@/services/steel-heat-approval.service";
import { HEAT_APPROVAL_STAGE_ORDER } from "@/services/steel-heat-approval.service";
import { stageToScreenIndex } from "./screenMap";

type StepState = ProcessProgressStepState;
type Step = ProcessProgressStep;

// Real field/allowedActions checks only — mirrors the same "done" conditions
// each S1/S2/S3 screen shell already uses for its own SubStepCard statuses.
function buildSteps(heatApproval: SteelHeatApproval): Step[] {
  const actions = heatApproval.allowedActions ?? [];
  const screenIdx = stageToScreenIndex(heatApproval.stage);
  const stageIdx = HEAT_APPROVAL_STAGE_ORDER.indexOf(heatApproval.stage);

  function state(done: boolean, active: boolean): StepState {
    if (done) return "done";
    if (active) return "active";
    return "pending";
  }

  const past = (stage: (typeof HEAT_APPROVAL_STAGE_ORDER)[number]) =>
    stageIdx >= HEAT_APPROVAL_STAGE_ORDER.indexOf(stage);

  if (screenIdx === 0) {
    return [
      { code: "A01", label: "Sample Taken", state: "done" },
      { code: "A02", label: "Sample Analyzed", state: state(past("A02_ANALYZE_SAMPLE"), actions.includes("ANALYZE_SAMPLE")) },
      { code: "A03", label: "Chemistry Compared", state: state(past("A03_COMPARE_CHEMISTRY"), actions.includes("COMPARE_CHEMISTRY")) },
      { code: "A04", label: "Correction Decided", state: state(past("A04_DECIDE_CORRECTION"), actions.includes("DECIDE_CORRECTION")) },
      { code: "A05", label: "Correction Material Added", state: state(past("A05_ADD_CORRECTION_MATERIAL"), actions.includes("ADD_CORRECTION_MATERIAL")) },
      { code: "A06", label: "Chemistry Re-tested", state: state(past("A06_RETEST_CHEMISTRY"), actions.includes("RETEST_CHEMISTRY")) },
    ];
  }

  if (screenIdx === 1) {
    return [
      { code: "A07", label: "Temperature Checked", state: state(past("A07_CHECK_TEMPERATURE"), actions.includes("CHECK_TEMPERATURE")) },
      { code: "A08", label: "Ladle Readiness Checked", state: state(past("A08_CHECK_LADLE_READINESS"), actions.includes("CHECK_LADLE_READINESS")) },
    ];
  }

  const closed = heatApproval.status === "CLOSED";
  return [
    { code: "A09", label: "Chemistry & Temperature Approved", state: state(past("A09_APPROVE_CHEMISTRY_TEMPERATURE"), actions.includes("APPROVE_CHEMISTRY_TEMPERATURE")) },
    { code: "A10", label: "Heat Number Confirmed", state: state(past("A10_CONFIRM_HEAT_NUMBER"), actions.includes("CONFIRM_HEAT_NUMBER")) },
    { code: "A11", label: "Tapping Approved", state: state(past("A11_TAPPING_APPROVAL"), actions.includes("TAPPING_APPROVAL")) },
    { code: "A12", label: "Tapped Into Ladle", state: state(past("A12_TAP_TO_LADLE"), actions.includes("TAP_TO_LADLE")) },
    { code: "A13", label: "Released to Casting", state: state(closed, actions.includes("RELEASE_TO_CASTING")) },
  ];
}

// Persistent "current screen" checklist — distinct from the top
// WorkflowIndicator (which shows S1/S2/S3 sub-step labels only). Rendering
// is delegated to the shared ProcessProgress; all real done/active/pending/
// blocked calculation stays here in buildSteps(), unchanged.
export function HeatApprovalProgress({ heatApproval }: { heatApproval: SteelHeatApproval }) {
  const steps = buildSteps(heatApproval);
  const activeColorBar = STEEL_PROCESSES.find((p) => p.code === "P06")?.color.bar;
  const statusNote =
    heatApproval.status === "ON_HOLD"
      ? "This heat approval record is on hold — no further progress until it resumes."
      : heatApproval.status === "CANCELLED"
        ? "This heat approval record was cancelled."
        : undefined;

  return <ProcessProgress title="Heat Approval Progress" steps={steps} activeColorBar={activeColorBar} statusNote={statusNote} />;
}
