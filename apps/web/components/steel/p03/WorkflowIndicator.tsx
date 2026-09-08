"use client";

import { Check } from "lucide-react";
import type { SubStep } from "./screenMap";

interface Props {
  steps: SubStep[];
  /** Number of steps (from the start) considered fully complete. */
  doneCount: number;
  /** Index of the currently active step, or null if none is active. */
  activeIndex: number | null;
}

// Horizontal numbered-circle stepper for the current S1/S2/S3 screen's real
// sub-steps (e.g. Gate Arrival / Documents / Weigh In / Safety Check for
// S1). This is a page-level visual affordance only — it groups the same
// A01-A14 activities defined in screenMap.ts's SCREEN_TOP_STEPS, never a
// second taxonomy.
export function WorkflowIndicator({ steps, doneCount, activeIndex }: Props) {
  return (
    <div className="flex items-center justify-start md:justify-center overflow-x-auto py-1">
      {steps.map((step, i) => {
        const isDone = i < doneCount;
        const isActive = i === activeIndex;
        return (
          <div key={step.code} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5 w-20">
              <div
                className={
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors " +
                  (isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-400 ring-1 ring-slate-200")
                }
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={
                  "text-xs font-medium text-center leading-tight " +
                  (isDone || isActive ? "text-slate-800" : "text-slate-400")
                }
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={"h-px w-8 md:w-12 shrink-0 mb-5 " + (i < doneCount ? "bg-emerald-400" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
