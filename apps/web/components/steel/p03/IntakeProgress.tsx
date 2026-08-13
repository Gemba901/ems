"use client";

import { Check, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelMaterialIntake } from "@/services/material-intake.service";
import { stageToScreenIndex } from "./screenMap";

type StepState = "done" | "active" | "pending" | "blocked";

interface Step {
  code: string;
  label: string;
  state: StepState;
  note?: string;
}

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

const DOT_CLASS: Record<StepState, string> = {
  done: "bg-emerald-500 text-white",
  active: "bg-blue-600 text-white",
  pending: "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
  blocked: "bg-red-50 text-red-400 ring-1 ring-red-200",
};

// Persistent "current screen" checklist — distinct from the top WorkflowIndicator
// (which shows S1/S2/S3 only). This answers "where exactly am I within this
// screen" without exposing A01-A14 as the primary navigation taxonomy.
export function IntakeProgress({ intake }: { intake: SteelMaterialIntake }) {
  const steps = buildSteps(intake);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intake Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {steps.map((step) => (
            <li key={step.code} className="flex items-start gap-2.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${DOT_CLASS[step.state]}`}>
                {step.state === "done" ? <Check className="h-3 w-3" /> : step.state === "blocked" ? <Lock className="h-2.5 w-2.5" /> : null}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-medium leading-tight ${step.state === "pending" ? "text-slate-400" : step.state === "blocked" ? "text-red-500" : "text-slate-800"}`}>
                  {step.label} <span className="text-slate-400 font-mono">— {step.code}</span>
                </p>
                {step.note && <p className="text-[11px] text-amber-600 mt-0.5">{step.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
