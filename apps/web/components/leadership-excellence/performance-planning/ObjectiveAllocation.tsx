"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type {
  Objective,
  Pillar,
  PlanningDocument,
} from "@/services/leadership-excellence/performance-planning/types";
import {
  PILLAR_BUDGETS,
  OBJECTIVE_PILLAR_NAMES,
  formatObjectiveWeight,
  objectiveAllocation,
  objectiveWeightLimit,
  planningPillarBudgets,
} from "@/services/leadership-excellence/performance-planning/objective-weightage";
import { Button, Modal } from "./PlanningUi";
import { usePlanning } from "./PlanningProvider";

export function ObjectiveWeightSummary({
  objective,
  document,
}: {
  objective: Objective;
  document?: PlanningDocument;
}) {
  const { data } = usePlanning();
  const plan = document || data.documents.find((plan) => plan.data.objectives.some((item) => item.id === objective.id));
  const limit = objectiveWeightLimit(objective.pillar, planningPillarBudgets(plan, data.references).weights);
  return (
    <div
      className="space-y-1.5 text-xs text-muted-foreground sm:shrink-0"
      aria-label={`Priority and weightage for ${objective.title || objective.code}`}
    >
      <p>
        Objective priority:{" "}
        <strong className="font-semibold text-foreground">
          {objective.priority == null ? "Not set" : `${objective.priority}/10`}
        </strong>
      </p>
      <p>
        Weight in company score:{" "}
        <strong className="font-semibold text-foreground">
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
  document,
}: {
  objectives: readonly Objective[];
  pillar: Pillar;
  document?: PlanningDocument;
}) {
  const { data } = usePlanning();
  const plan = document || data.documents.find((plan) => plan.data.objectives.some((item) => objectives.some((objective) => objective.id === item.id)));
  const allocation = objectiveAllocation(objectives, pillar, planningPillarBudgets(plan, data.references).weights);
  if (!allocation.count || allocation.balanced) return null;
  return (
    <p role="status" className="text-xs leading-5 text-warning">
      {pillar} pillar total: {formatObjectiveWeight(allocation.total)}% /{" "}
      {allocation.target}%. {allocation.messages.join(" ")}
    </p>
  );
}

export function ObjectiveAllocation({
  objectives,
  document,
}: {
  objectives: readonly Objective[];
  document?: PlanningDocument;
}) {
  const { data } = usePlanning();
  const plan = document || data.documents.find((plan) => plan.data.objectives.some((item) => objectives.some((objective) => objective.id === item.id)));
  const budgets = planningPillarBudgets(plan, data.references);
  const [open, setOpen] = useState(false);
  const allocations = (Object.keys(PILLAR_BUDGETS) as Pillar[]).map((pillar) =>
    objectiveAllocation(objectives, pillar, budgets.weights),
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
            <p className="text-xs leading-5 text-muted-foreground">{budgets.label}.</p>
            {allocations.map((allocation) => (
              <section
                key={allocation.pillar}
                className={`rounded-lg border p-4 ${!allocation.count ? "border-border bg-muted" : allocation.balanced ? "border-success/30 bg-success-subtle/60" : "border-warning/30 bg-warning-subtle/60"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {OBJECTIVE_PILLAR_NAMES[allocation.pillar]}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {allocation.pillar}
                    </span>
                  </h3>
                  <strong className="text-sm">
                    {formatObjectiveWeight(allocation.total)}% /{" "}
                    {allocation.target}%
                  </strong>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {allocation.messages.join(" ")}
                </p>
              </section>
            ))}
            <p className="text-xs leading-5 text-muted-foreground">
              Individual objectives can be approved within the pillar budget while allocation remains incomplete. Whole-plan approval requires each used pillar's total to match its allocation. Unallocated weight is a planning gap, not failed performance. Values are never redistributed automatically.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
