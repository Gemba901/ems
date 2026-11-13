"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type {
  Objective,
  Pillar,
} from "@/services/leadership-excellence/performance-planning/types";
import {
  PILLAR_BUDGETS,
  OBJECTIVE_PILLAR_NAMES,
  formatObjectiveWeight,
  objectiveAllocation,
  objectiveWeightLimit,
} from "@/services/leadership-excellence/performance-planning/objective-weightage";
import { Button, Modal } from "./PlanningUi";

export function ObjectiveWeightSummary({
  objective,
}: {
  objective: Objective;
}) {
  const limit = objectiveWeightLimit(objective.pillar);
  return (
    <div
      className="space-y-1.5 text-xs text-slate-500 sm:shrink-0"
      aria-label={`Priority and weightage for ${objective.title || objective.code}`}
    >
      <p>
        Priority:{" "}
        <strong className="font-semibold text-slate-900">
          {objective.priority == null ? "Not set" : `${objective.priority}/10`}
        </strong>
      </p>
      <p>
        Weightage:{" "}
        <strong className="font-semibold text-slate-900">
          {objective.weightage == null
            ? "Unassigned"
            : `${formatObjectiveWeight(objective.weightage)}%`}
        </strong>
        {limit !== null && (
          <span className="ml-1 text-[10px]">
            ({objective.pillar} max {limit}%)
          </span>
        )}
      </p>
    </div>
  );
}

export function ObjectiveAllocationNotice({
  objectives,
  pillar,
}: {
  objectives: readonly Objective[];
  pillar: Pillar;
}) {
  const allocation = objectiveAllocation(objectives, pillar);
  if (!allocation.count || allocation.balanced) return null;
  return (
    <p role="status" className="text-xs leading-5 text-amber-800">
      {pillar} pillar total: {formatObjectiveWeight(allocation.total)}% /{" "}
      {allocation.target}%. {allocation.messages.join(" ")}
    </p>
  );
}

export function ObjectiveAllocation({
  objectives,
}: {
  objectives: readonly Objective[];
}) {
  const [open, setOpen] = useState(false);
  const allocations = (Object.keys(PILLAR_BUDGETS) as Pillar[]).map((pillar) =>
    objectiveAllocation(objectives, pillar),
  );
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={15} /> Check pillar weights
      </Button>
      {open && (
        <Modal
          title="Company objective weights"
          onClose={() => setOpen(false)}
          description="These are totals across the objectives in this plan. Edit each objective to change its own priority or weightage."
          footer={
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          <div className="space-y-3">
            {allocations.map((allocation) => (
              <section
                key={allocation.pillar}
                className={`rounded-lg border p-4 ${!allocation.count ? "border-slate-200 bg-slate-50" : allocation.balanced ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {OBJECTIVE_PILLAR_NAMES[allocation.pillar]}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {allocation.pillar}
                    </span>
                  </h3>
                  <strong className="text-sm">
                    {formatObjectiveWeight(allocation.total)}% /{" "}
                    {allocation.target}%
                  </strong>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {allocation.messages.join(" ")}
                </p>
              </section>
            ))}
            <p className="text-xs leading-5 text-slate-500">
              You can save incomplete drafts. Objectives in each used pillar
              must total its fixed allocation before approval. Values are never
              redistributed automatically.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
