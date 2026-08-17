"use client";

import { Check, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelChargePreparation } from "@/services/steel-charge-preparation.service";
import { CHARGE_STAGE_ORDER } from "@/services/steel-charge-preparation.service";
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

const DOT_CLASS: Record<StepState, string> = {
  done: "bg-emerald-500 text-white",
  active: "bg-blue-600 text-white",
  pending: "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
  blocked: "bg-red-50 text-red-400 ring-1 ring-red-200",
};

// Persistent "current screen" checklist — distinct from the top
// WorkflowIndicator (which shows S1/S2/S3 sub-step labels only). Answers
// "where exactly am I within this screen" without exposing A01-A12 as the
// primary navigation taxonomy.
export function ChargeProgress({ prep }: { prep: SteelChargePreparation }) {
  const steps = buildSteps(prep);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preparation Progress</CardTitle>
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
        {(prep.status === "ON_HOLD" || prep.status === "CANCELLED") && (
          <p className="text-[11px] text-amber-600 mt-3">
            {prep.status === "ON_HOLD" ? "This preparation is on hold — no further progress until it resumes." : "This preparation was cancelled."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
