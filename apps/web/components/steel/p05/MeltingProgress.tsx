"use client";

import { Check, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SteelMelting } from "@/services/steel-melting.service";
import { MELTING_STAGE_ORDER } from "@/services/steel-melting.service";
import { stageToScreenIndex } from "./screenMap";

type StepState = "done" | "active" | "pending" | "blocked";

interface Step {
  code: string;
  label: string;
  state: StepState;
}

// Real field/allowedActions checks only — mirrors the same "done" conditions
// each S1/S2/S3 screen shell already uses for its own SubStepCard statuses.
// Mirrors components/steel/p04/ChargeProgress.tsx.
function buildSteps(melting: SteelMelting): Step[] {
  const actions = melting.allowedActions ?? [];
  const screenIdx = stageToScreenIndex(melting.stage);
  const stageIdx = MELTING_STAGE_ORDER.indexOf(melting.stage);

  function state(done: boolean, active: boolean): StepState {
    if (done) return "done";
    if (active) return "active";
    return "pending";
  }

  const past = (stage: (typeof MELTING_STAGE_ORDER)[number]) => stageIdx >= MELTING_STAGE_ORDER.indexOf(stage);

  if (screenIdx === 0) {
    return [
      { code: "A01", label: "Furnace Availability Confirmed", state: "done" },
      { code: "A02", label: "Lining Checked", state: state(past("A02_FURNACE_LINING_CHECK"), actions.includes("CHECK_LINING")) },
      { code: "A03", label: "Systems Checked", state: state(past("A03_FURNACE_SYSTEMS_CHECK"), actions.includes("CHECK_UTILITIES")) },
      { code: "A04", label: "Previous Heat Confirmed", state: state(past("A04_PREVIOUS_HEAT_READINESS"), actions.includes("CHECK_PREVIOUS_HEAT")) },
      { code: "A05", label: "Charge Verified", state: state(past("A05_VERIFY_CHARGE_RECIPE"), actions.includes("VERIFY_CHARGE")) },
    ];
  }

  if (screenIdx === 1) {
    return [
      { code: "A06", label: "Charge Loaded", state: state(past("A06_LOAD_CHARGE"), actions.includes("LOAD_CHARGE")) },
      { code: "A07", label: "Melting Started", state: state(past("A07_START_MELTING"), actions.includes("START_MELTING")) },
      { code: "A08", label: "Power Monitored", state: state(past("A08_MONITOR_POWER"), actions.includes("MONITOR_POWER")) },
      { code: "A09", label: "Temperature Monitored", state: state(past("A09_MONITOR_TEMPERATURE"), actions.includes("MONITOR_TEMPERATURE")) },
    ];
  }

  const closed = melting.status === "CLOSED";
  return [
    { code: "A10", label: "Additions Recorded", state: state(past("A10_RECORD_ADDITIONS"), actions.includes("RECORD_ADDITIONS")) },
    { code: "A11", label: "Slag Removed", state: state(past("A11_REMOVE_SLAG"), actions.includes("REMOVE_SLAG")) },
    { code: "A12", label: "Output Recorded", state: state(past("A12_RECORD_MELT_OUTPUT"), actions.includes("RECORD_OUTPUT")) },
    { code: "A13", label: "Liquid Steel Ready", state: state(past("A13_CONFIRM_LIQUID_READY"), actions.includes("CONFIRM_READY")) },
    { code: "A14", label: "Handed Over to Refining", state: state(closed, actions.includes("REFINING_HANDOVER")) },
  ];
}

const DOT_CLASS: Record<StepState, string> = {
  done: "bg-emerald-500 text-white",
  active: "bg-red-600 text-white",
  pending: "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
  blocked: "bg-red-50 text-red-400 ring-1 ring-red-200",
};

// Persistent "current screen" checklist — distinct from the top
// WorkflowIndicator (which shows S1/S2/S3 sub-step labels only).
export function MeltingProgress({ melting }: { melting: SteelMelting }) {
  const steps = buildSteps(melting);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Melting Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {steps.map((step) => (
            <li key={step.code} className="flex items-start gap-2.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${DOT_CLASS[step.state]}`}>
                {step.state === "done" ? <Check className="h-3 w-3" /> : step.state === "blocked" ? <Lock className="h-2.5 w-2.5" /> : null}
              </div>
              <p className={`text-xs font-medium leading-tight ${step.state === "pending" ? "text-slate-400" : step.state === "blocked" ? "text-red-500" : "text-slate-800"}`}>
                {step.label} <span className="text-slate-400 font-mono">— {step.code}</span>
              </p>
            </li>
          ))}
        </ul>
        {(melting.status === "ON_HOLD" || melting.status === "CANCELLED") && (
          <p className="text-[11px] text-amber-600 mt-3">
            {melting.status === "ON_HOLD" ? "This melting record is on hold — no further progress until it resumes." : "This melting record was cancelled."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
