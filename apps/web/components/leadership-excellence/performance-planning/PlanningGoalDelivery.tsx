"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  Goal,
  ItemKind,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { DefinitionEditor } from "./PlanningEditors";
import { SharedActions } from "./PlanningLinks";

type Plan = PlanningView["documents"][number];
type Edit = {
  document: PlanningDocument;
  kind: ItemKind;
  initial?: Record<string, unknown>;
};
const value = (number: number | null | undefined) =>
  number == null ? "Not set" : String(number);
const frequency = (name: string) => name.replaceAll("_", " ").toLowerCase();

/** Keep delivery attached to its contribution, using the existing record IDs. */
export function PlanningGoalDelivery({
  document,
  goal,
  edit,
}: {
  document: Plan;
  goal: Goal;
  edit: (value: Edit) => void;
}) {
  const { data } = usePlanning();
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const canEdit = document.permissions.canEdit && document.kind !== "COMPANY";
  const canDefine =
    canEdit &&
    (["ADMIN", "SUPER_ADMIN", "MANAGEMENT", "HOD"].includes(data.actor.role) ||
      data.documents.some((plan) =>
        plan.data.coordinatorIds.includes(data.actor.employeeId),
      ));
  const assignments = document.data.assignments.filter(
    (assignment) => assignment.goalId === goal.id,
  );
  const actions = document.data.actions.filter(
    (action) => action.goalId === goal.id,
  );
  const owner = (id?: string) =>
    data.references.people.find((person) => person.id === id)?.name ||
    "Not assigned";

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gemba-navy">
              KPI assignments
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Who reports, what is measured and when.
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                edit({
                  document,
                  kind: "assignment",
                  initial: {
                    goalId: goal.id,
                    ownerId: goal.ownerId,
                    startDate: goal.startDate,
                    endDate: goal.endDate,
                  },
                })
              }
            >
              <Plus size={14} /> Assign KPI
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {assignments.map((assignment) => {
            const definition = data.definitions.find(
              (item) => item.id === assignment.definitionId,
            );
            const missing = assignment.targets.filter(
              (period) => period.scheduled !== false && period.target == null,
            ).length;
            return (
              <article
                key={assignment.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <h4 className="break-words text-sm font-medium text-gemba-navy">
                  {definition?.name || "KPI not selected"}
                </h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Target{" "}
                  {assignment.targetMode === "SAME"
                    ? `${value(assignment.target)} ${definition?.unit || ""}`
                    : "set by reporting period"}
                  {" · "}
                  {frequency(assignment.updateFrequency)}
                  {" · "}
                  {owner(assignment.ownerId)}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Baseline {value(assignment.baseline)} · Review{" "}
                  {frequency(assignment.reviewFrequency)}
                  {missing > 0 ? ` · ${missing} targets to complete` : ""}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium">
                    Reporting details
                  </summary>
                  <div className="mt-2 space-y-1 break-words leading-5">
                    <p>
                      {assignment.code} ·{" "}
                      {data.kras.find((kra) => kra.id === definition?.kraId)
                        ?.name || "KRA not selected"}
                    </p>
                    <p>
                      Provider: {owner(assignment.providerId)} · Verifier:{" "}
                      {owner(assignment.verifierId)}
                    </p>
                    <p>Source: {assignment.source || "Not set"}</p>
                    <p>
                      {assignment.targets.length} reporting periods ·{" "}
                      {assignment.startDate || "Start not set"} –{" "}
                      {assignment.endDate || "End not set"}
                    </p>
                    {assignment.baseline == null &&
                      assignment.baselineReason && (
                        <p>Baseline unavailable: {assignment.baselineReason}</p>
                      )}
                    {definition?.adaptedFromId && (
                      <p>
                        Adapted from{" "}
                        {data.definitions.find(
                          (item) => item.id === definition.adaptedFromId,
                        )?.code || "original definition"}
                      </p>
                    )}
                  </div>
                </details>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-0 text-xs"
                  onClick={() =>
                    edit({
                      document,
                      kind: "assignment",
                      initial: { ...assignment },
                    })
                  }
                >
                  {canEdit ? "Edit assignment" : "View assignment"}
                </Button>
              </article>
            );
          })}
          {!assignments.length && (
            <p className="text-xs leading-5 text-muted-foreground">
              {canEdit
                ? "No KPI assigned. Add the measure right here."
                : "No KPI assignments added."}
            </p>
          )}
          {canDefine && (
            <button
              type="button"
              className="text-xs font-medium text-gemba-navy hover:underline"
              onClick={() => setDefinitionOpen(true)}
            >
              Need a different measure? Create / adapt KPI
            </button>
          )}
        </div>
      </section>
      <section className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gemba-navy">
              Delivery actions
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The work needed to achieve this result.
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                edit({
                  document,
                  kind: "action",
                  initial: {
                    goalId: goal.id,
                    ownerId: goal.ownerId,
                    dueDate: goal.endDate,
                  },
                })
              }
            >
              <Plus size={14} /> Add action
            </Button>
          )}
        </div>
        <div className="mt-3 space-y-3">
          {actions.map((action) => (
            <article
              key={action.id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <h4 className="break-words text-sm font-medium text-gemba-navy">
                {action.title || "Untitled action"}
              </h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {owner(action.ownerId)} · Due {action.dueDate || "not set"}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                {action.expectedResult || "Expected result not set"}
              </p>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">
                  Action details
                </summary>
                <div className="mt-2 space-y-1 break-words leading-5">
                  <p>
                    {action.code}
                    {action.parentActionId ? " · Sub-action" : ""}
                  </p>
                  <p>
                    Completion evidence:{" "}
                    {action.completionEvidence || "Not set"}
                  </p>
                  {action.support && <p>Support: {action.support}</p>}
                </div>
              </details>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-0 text-xs"
                onClick={() =>
                  edit({ document, kind: "action", initial: { ...action } })
                }
              >
                {canEdit ? "Edit action" : "View action"}
              </Button>
            </article>
          ))}
          {!actions.length &&
            !(document.data.actionLinks || []).some(
              (link) => link.goalId === goal.id,
            ) && (
              <p className="text-xs leading-5 text-muted-foreground">
                {goal.noActionReason ||
                  (canEdit
                    ? "Add an action, or explain in the contribution why existing work is sufficient."
                    : "No delivery actions linked.")}
              </p>
            )}
          <SharedActions document={document} fixedGoalId={goal.id} />
        </div>
      </section>
      {definitionOpen && (
        <DefinitionEditor onClose={() => setDefinitionOpen(false)} />
      )}
    </div>
  );
}
