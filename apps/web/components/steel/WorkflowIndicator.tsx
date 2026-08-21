"use client";

import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface WorkflowStep {
  code: string;
  label: string;
}

interface Props {
  steps: WorkflowStep[];
  /** Number of steps (from the start) considered fully complete. */
  doneCount: number;
  /** Index of the currently active step, or null if none is active. */
  activeIndex: number | null;
  /** Active-step accent — pass STEEL_PROCESSES[code].color.bar (the solid variant); "done" always renders semantic green regardless. */
  activeColorBar?: string;
}

/**
 * Canonical top-stepper workflow indicator for P01/P02/P04/P06 (the
 * processes still on the S1-S6-multi-page detail model). Replaces 4
 * near-identical per-process copies — the only real difference between
 * them was the active-step color, now a prop instead of hardcoded per
 * copy. Done/active/upcoming is derived purely from doneCount/activeIndex,
 * same as before; callers still own all stage logic.
 *
 * P05 uses MeltingSidebarNav instead (a different left-nav UX for its
 * single-page detail model) — deliberately not unified into this
 * component, per the steel refactor's explicit rule not to force P05's
 * pattern onto the others or vice versa.
 */
export function WorkflowIndicator({ steps, doneCount, activeIndex, activeColorBar }: Props) {
  const activeBg = activeColorBar ?? "bg-blue-600";

  return (
    <Card>
      <CardContent className="py-1">
        <div className="flex items-center overflow-x-auto">
          {steps.map((s, i) => {
            const isDone = i < doneCount;
            const isActive = i === activeIndex;
            return (
              <div key={s.code} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
                      (isDone ? "bg-emerald-500 text-white" : isActive ? `${activeBg} text-white` : "bg-slate-100 text-slate-400 ring-1 ring-slate-200")
                    }
                  >
                    {isDone || isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={"text-xs font-medium whitespace-nowrap " + (isDone || isActive ? "text-slate-900" : "text-slate-400")}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && <div className="h-px w-8 md:w-10 bg-slate-200 mx-2 shrink-0" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
