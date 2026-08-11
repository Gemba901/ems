"use client";

import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SCREENS } from "./screenMap";

interface Props {
  /** Number of screens (from the start) considered fully complete. */
  doneCount: number;
  /** Index of the currently active screen, or null if none is active
   * (e.g. the workflow is fully complete). */
  activeIndex: number | null;
}

// Shared S1-S6 workflow pill strip. Done/active/upcoming is derived purely
// from doneCount/activeIndex — callers decide those two numbers from the
// real server stage (and, where relevant, their own acknowledgement state),
// so this component has no stage logic of its own.
export function WorkflowIndicator({ doneCount, activeIndex }: Props) {
  return (
    <Card>
      <CardContent className="py-1">
        <div className="flex items-center overflow-x-auto">
          {SCREENS.map((s, i) => {
            const isDone = i < doneCount;
            const isActive = i === activeIndex;
            return (
              <div key={s.code} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 " +
                      (isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-400 ring-1 ring-slate-200")
                    }
                  >
                    {isDone || isActive ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className={
                      "text-xs font-medium whitespace-nowrap " +
                      (isDone || isActive ? "text-slate-900" : "text-slate-400")
                    }
                  >
                    {s.label}
                  </span>
                </div>
                {i < SCREENS.length - 1 && <div className="h-px w-8 md:w-10 bg-slate-200 mx-2 shrink-0" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
