"use client";

import { Check, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ProcessProgressStepState = "done" | "active" | "pending" | "blocked";

export interface ProcessProgressStep {
  code: string;
  label: string;
  state: ProcessProgressStepState;
  note?: string;
}

interface Props {
  title: string;
  steps: ProcessProgressStep[];
  /** Active-step accent — pass STEEL_PROCESSES[code].color.bar (the solid variant). */
  activeColorBar?: string;
  /** Optional banner for ON_HOLD/CANCELLED-style states — caller decides the message and whether to show it. */
  statusNote?: string;
}

/**
 * Canonical "current screen" progress checklist — replaces P03's
 * IntakeProgress, P04's ChargeProgress, and P06's HeatApprovalProgress
 * (near-byte-identical rendering, each with its own copy of the dot/label
 * markup). The done/active/pending/blocked calculation for each process's
 * real activities stays where it was — in that process's own
 * `buildSteps()` — this component only renders the resulting list. Distinct
 * from the top WorkflowIndicator (S1-S6 labels only): this answers "where
 * exactly am I within this screen" without exposing every activity code as
 * top-level navigation.
 */
export function ProcessProgress({ title, steps, activeColorBar, statusNote }: Props) {
  const dotClass: Record<ProcessProgressStepState, string> = {
    done: "bg-emerald-500 text-white",
    active: `${activeColorBar ?? "bg-blue-600"} text-white`,
    pending: "bg-slate-100 text-slate-400 ring-1 ring-slate-200",
    blocked: "bg-red-50 text-red-400 ring-1 ring-red-200",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {steps.map((step) => (
            <li key={step.code} className="flex items-start gap-2.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${dotClass[step.state]}`}>
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
        {statusNote && <p className="text-[11px] text-amber-600 mt-3">{statusNote}</p>}
      </CardContent>
    </Card>
  );
}
