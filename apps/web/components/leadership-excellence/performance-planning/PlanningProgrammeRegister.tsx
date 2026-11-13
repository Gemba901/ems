"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type {
  Assignment,
  Goal,
  KpiDefinition,
  Objective,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { resolveParentGoal } from "@/services/leadership-excellence/performance-planning/measurable-objective";
import { programmeItemState } from "@/services/leadership-excellence/performance-planning/programme";
import {
  goalActionRows,
  visibleProgrammeActionRows,
} from "@/services/leadership-excellence/performance-planning/programme-action-links";
import { usePlanning } from "./PlanningProvider";
import { ProgrammeActionList } from "./PlanningProgrammeActions";
import { approvedParents } from "./PlanningParents";
import { findingReviewStatus } from "./PlanningSources";
import {
  ObjectiveAllocation,
  ObjectiveAllocationNotice,
  ObjectiveWeightSummary,
} from "./ObjectiveAllocation";
import { Button, Empty, Field, control, frequencies } from "./PlanningUi";

type Plan = PlanningView["documents"][number];
export type ProgrammeItemState = {
  approved: boolean;
  version: number;
  canEdit: boolean;
  canApprove: boolean;
};
export type ProgrammeRegisterAction =
  | { action: "create-objective" | "create-department" | "create-individual" }
  | {
      action:
        | "edit-objective"
        | "review-objective"
        | "revise-objective"
        | "contribute";
      document: Plan;
      objective: Objective;
    }
  | {
      action: "edit-goal" | "review-goal" | "revise-goal" | "add-action";
      document: Plan;
      goal: Goal;
    }
  | {
      action: "edit-individual" | "review-individual" | "revise-individual";
      document: Plan;
    };

const panel = "min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
const pillarOrder = ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"];
const value = (number: number | null | undefined) =>
  number == null ? "Not set" : String(number);

function Badge({ approved }: { approved: boolean }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-[11px] ${approved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
    >
      {approved ? "Approved" : "Draft"}
    </span>
  );
}

function objectiveResult(objective: Objective) {
  // Older measurable objectives stored their result in title. Never infer it from a linked goal.
  return objective.result || objective.meaning || objective.title;
}

function AssignedKpis({
  assignments,
  definitions,
}: {
  assignments: Assignment[];
  definitions: KpiDefinition[];
}) {
  if (!assignments.length) return null;
  return (
    <div className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3 text-xs leading-5 text-slate-600">
      <p className="font-medium text-slate-700">
        Assigned KPIs ({assignments.length})
      </p>
      {assignments.map((assignment) => {
        const definition = definitions.find(
          (item) => item.id === assignment.definitionId,
        );
        const frequency = frequencies.find(
          ([code]) => code === assignment.updateFrequency,
        )?.[1];
        return (
          <p key={assignment.id} data-individual-kpi-id={assignment.id}>
            <span className="font-medium">
              {definition?.name || "KPI not selected"}
            </span>{" "}
            ·{" "}
            {assignment.targetMode === "VARIED"
              ? `Targets vary across ${assignment.targets.length} periods`
              : `Target ${value(assignment.target)}${assignment.upper == null ? "" : `–${assignment.upper}`} ${definition?.unit || ""}`}
            {frequency ? ` · ${frequency}` : " · Frequency not set"}
          </p>
        );
      })}
    </div>
  );
}

function fallbackState(document: Plan): ProgrammeItemState {
  return {
    approved: document.status === "APPROVED",
    version: document.versions.at(-1)?.version || 1,
    canEdit: document.permissions.canEdit,
    canApprove: document.permissions.canApprove,
  };
}

/** All authorised records in the period are listed together, without a setup wizard. */
export function PlanningProgrammeRegister({
  section,
  cycle,
  onAction,
  stateFor,
  children,
}: {
  section: "company" | "department" | "individual";
  cycle: string;
  onAction: (event: ProgrammeRegisterAction) => void;
  stateFor?: (
    document: Plan,
    kind: "objective" | "goal" | "individual",
    id: string,
  ) => ProgrammeItemState;
  children?: ReactNode;
}) {
  const { data, busy } = usePlanning();
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState("");
  const allPlans = data.documents.filter(
    (document) => document.cycle === cycle && document.permissions.canRead,
  );
  const companies = allPlans.filter((document) => document.kind === "COMPANY");
  const departments = allPlans.filter(
    (document) => document.kind === "DEPARTMENT",
  );
  const individuals = allPlans.filter(
    (document) => document.kind === "INDIVIDUAL",
  );
  const objectives = companies
    .flatMap((document) =>
      document.data.objectives.map((objective) => ({ document, objective })),
    )
    .sort(
      (a, b) =>
        pillarOrder.indexOf(a.objective.pillar) -
          pillarOrder.indexOf(b.objective.pillar) ||
        a.objective.code.localeCompare(b.objective.code),
    );
  const state = (
    document: Plan,
    kind: "objective" | "goal" | "individual",
    id: string,
  ) =>
    stateFor?.(document, kind, id) ||
    (kind === "individual"
      ? fallbackState(document)
      : programmeItemState(document, kind, id));
  const employee = (id: string) =>
    data.references.people.find((person) => person.id === id);
  const owner = (id: string) => employee(id)?.name || "Not assigned";
  const departmentName = (id: string) =>
    data.references.departments.find((department) => department.id === id)
      ?.name || "Department unavailable";
  const canManage = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
    data.actor.role,
  );
  const canCreate =
    canManage ||
    (section !== "company" && data.actor.role === "HOD") ||
    allPlans.some(
      (plan) =>
        plan.permissions.canEdit &&
        plan.kind ===
          (section === "company"
            ? "COMPANY"
            : section === "department"
              ? "DEPARTMENT"
              : "INDIVIDUAL"),
    );
  const parentInfo = (goal: Goal) => {
    if (!goal.parent) return null;
    const reference = goal.parent;
    const document = data.documents.find(
      (plan) => plan.id === reference.documentId && plan.permissions.canRead,
    );
    const version = document?.versions.find(
      (snapshot) => snapshot.version === reference.version,
    );
    const full = version
      ? resolveParentGoal(version.data, reference)
      : undefined;
    const summary = approvedParents(data).find(
      (parent) =>
        parent.documentId === reference.documentId &&
        parent.version === reference.version &&
        parent.goal.id === reference.goalId &&
        (parent.itemKind || "GOAL") === (reference.itemKind || "GOAL"),
    );
    const record = full || summary?.goal;
    return record
      ? {
          record,
          kind: document?.kind || summary?.kind,
          reference,
          objectiveId:
            reference.itemKind === "OBJECTIVE"
              ? reference.goalId
              : full?.objectiveId || "",
        }
      : null;
  };
  const priorVersions = (
    document: Plan,
    kind: "objective" | "goal",
    id: string,
  ) =>
    document.versions.flatMap((version) => {
      const record =
        kind === "objective"
          ? version.data.objectives.find((item) => item.id === id)
          : version.data.goals.find((item) => item.id === id);
      return record ? [{ version, record }] : [];
    });
  const history = (document: Plan, kind: "objective" | "goal", id: string) => {
    const versions = priorVersions(document, kind, id);
    if (!versions.length) return null;
    return (
      <details className="border-t border-slate-100 pt-3 text-xs text-slate-500">
        <summary className="cursor-pointer">
          Approved versions ({versions.length})
        </summary>
        <div className="mt-3 space-y-3">
          {[...versions].reverse().map(({ version, record }) => (
            <div key={version.version} className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium text-slate-700">
                {record.code} · v{version.version} · Effective{" "}
                {version.effectiveDate || version.approvedAt.slice(0, 10)}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{record.title}</p>
              <p className="mt-1">
                {value(record.baseline)} → {value(record.target)}{" "}
                {record.unit || ""} · Due {record.endDate || "Not set"}
              </p>
              {version.reason && (
                <p className="mt-1">Change reason: {version.reason}</p>
              )}
            </div>
          ))}
        </div>
      </details>
    );
  };

  if (section === "company") {
    const count = objectives.filter(
      ({ document, objective }) =>
        state(document, "objective", objective.id).approved,
    ).length;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Company objectives
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              See each objective’s priority and weightage. Open a draft to edit
              its details.
            </p>
          </div>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <ObjectiveAllocation
                objectives={objectives.map(({ objective }) => objective)}
              />
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onAction({ action: "create-objective" })}
              >
                <Plus size={14} /> Create objective
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {objectives.length} saved objectives · {count} approved
        </p>
        {objectives.map(({ document, objective }) => {
          const item = state(document, "objective", objective.id);
          const oldGoals = document.data.goals.filter(
            (goal) => goal.objectiveId === objective.id,
          );
          return (
            <article
              key={document.id + "/" + objective.id}
              id={"objective-" + objective.id}
              data-objective-id={objective.id}
              className={panel + " space-y-4 border-l-[3px] border-l-[#7b81bc]"}
            >
              <div className="grid min-w-0 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                      {objective.code}
                    </span>
                    <Badge approved={item.approved} />
                  </div>
                  <h3 className="mt-3 break-words text-base font-semibold text-slate-900">
                    {objective.title || "Untitled objective"}
                  </h3>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                    {objectiveResult(objective) || "Result not described"}
                  </p>
                </div>
                <ObjectiveWeightSummary objective={objective} />
              </div>
              {canCreate && objective.pillar && (
                <ObjectiveAllocationNotice
                  objectives={objectives.map(({ objective }) => objective)}
                  pillar={objective.pillar}
                />
              )}
              <div className="flex flex-col items-stretch justify-between gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 text-xs text-slate-500">
                  {value(objective.baseline)} → {value(objective.target)}{" "}
                  {objective.unit || ""} ·{" "}
                  {objective.endDate
                    ? "Due " + objective.endDate
                    : "Date not set"}{" "}
                  · {owner(objective.ownerId)} · {objective.sources.length}{" "}
                  linked findings
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onAction({
                        action: "edit-objective",
                        document,
                        objective,
                      })
                    }
                  >
                    {item.approved || !item.canEdit
                      ? "View objective"
                      : "Open draft"}
                  </Button>
                  {!item.approved && item.canApprove && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        onAction({
                          action: "review-objective",
                          document,
                          objective,
                        })
                      }
                    >
                      Review &amp; approve
                    </Button>
                  )}
                  {!item.approved && !item.canApprove && item.canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onAction({
                          action: "review-objective",
                          document,
                          objective,
                        })
                      }
                    >
                      Check readiness
                    </Button>
                  )}
                  {item.approved && canCreate && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          onAction({
                            action: "contribute",
                            document,
                            objective,
                          })
                        }
                      >
                        Add department goal <ArrowRight size={13} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onAction({
                            action: "revise-objective",
                            document,
                            objective,
                          })
                        }
                      >
                        Revise
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {history(document, "objective", objective.id)}
              {!!oldGoals.length && (
                <details
                  className="border-t border-slate-100 pt-3 text-xs text-slate-500"
                  data-legacy-company-goals
                >
                  <summary className="cursor-pointer">
                    Earlier company goals ({oldGoals.length})
                  </summary>
                  <p className="mt-2">
                    Retained read-only for earlier approved links.
                  </p>
                  <div className="mt-2 space-y-3">
                    {oldGoals.map((goal) => (
                      <div key={goal.id} className="rounded-lg bg-slate-50 p-3">
                        <p>
                          {goal.code} · {goal.title}
                        </p>
                        <p className="mt-1">{goal.measure}</p>
                        <p className="mt-1">
                          {value(goal.baseline)} → {value(goal.target)}{" "}
                          {goal.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
        {!objectives.length && (
          <Empty title="No company objectives yet">
            Create a measurable objective and link its reviewed SWOT evidence.
            You can save incomplete details as a draft.
          </Empty>
        )}
        {children}
      </div>
    );
  }

  if (section === "department") {
    const all = departments.flatMap((document) =>
      document.data.goals.map((goal) => ({ document, goal })),
    );
    const visible = all.filter(({ document, goal }) => {
      const parent = parentInfo(goal);
      return (
        (!departmentFilter || document.scopeId === departmentFilter) &&
        (!objectiveFilter ||
          `${goal.parent?.documentId}/${parent?.objectiveId}` ===
            objectiveFilter)
      );
    });
    const departmentIds = new Set(departments.map((document) => document.id));
    const actions = visibleProgrammeActionRows(data).filter((row) =>
      departmentIds.has(row.documentId),
    );
    const completed = actions.filter(({ documentId, action }) =>
      data.programmeActionProgress?.some(
        (progress) =>
          progress.documentId === documentId &&
          progress.actionId === action.id &&
          progress.status === "COMPLETED",
      ),
    ).length;
    const direct = allPlans
      .filter((document) => document.kind === "SWOT")
      .flatMap((document) =>
        document.data.findings.filter(
          (finding) =>
            findingReviewStatus(finding, document) === "REVIEWED" &&
            finding.response === "ACTION",
        ),
      );
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Department goals &amp; actions
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Agree what each department will achieve, then assign the work.
            </p>
          </div>
          {canCreate && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction({ action: "create-department" })}
            >
              Add department goal
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-6 text-slate-600">
          Link each department goal directly to an approved company objective.
          Keep its delivery actions with the goal. Direct responses to reviewed
          SWOT findings stay with their finding below.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [
              departmentFilter || objectiveFilter
                ? `${visible.length} / ${all.length}`
                : all.length,
              "Department goals",
            ],
            [`${completed} / ${actions.length}`, "Actions completed"],
            [direct.length, "Findings for department action"],
          ].map(([count, label]) => (
            <div key={label} className={panel}>
              <strong className="text-2xl font-semibold text-slate-900">
                {count}
              </strong>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
        <section className={`${panel} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Department goals
            </h3>
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">
              Distinct measures
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company objective">
              <select
                className={control}
                value={objectiveFilter}
                onChange={(event) => setObjectiveFilter(event.target.value)}
              >
                <option value="">All company objectives</option>
                {objectives.map(({ document, objective }) => (
                  <option
                    key={`${document.id}/${objective.id}`}
                    value={`${document.id}/${objective.id}`}
                  >
                    {objective.code} · {objective.title}
                    {state(document, "objective", objective.id).approved
                      ? ""
                      : " (Draft)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select
                className={control}
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="">All departments</option>
                {data.references.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing {visible.length} of {all.length} department goals.
            </p>
            {(objectiveFilter || departmentFilter) && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setObjectiveFilter("");
                  setDepartmentFilter("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {visible.map(({ document, goal }) => {
              const item = state(document, "goal", goal.id),
                parent = parentInfo(goal),
                actions = goalActionRows(data, document, goal);
              return (
                <article
                  key={`${document.id}/${goal.id}`}
                  data-contribution-id={goal.id}
                  className={`${panel} space-y-4`}
                >
                  <div
                    className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                    data-goal-card-header
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">
                        {goal.code} · {departmentName(document.scopeId)}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold leading-6 text-slate-900">
                        <button
                          type="button"
                          data-goal-title={goal.id}
                          className="max-w-full rounded text-left whitespace-pre-wrap break-words decoration-slate-400 underline-offset-4 hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          onClick={() =>
                            onAction({ action: "edit-goal", document, goal })
                          }
                        >
                          {goal.title || "Untitled draft goal"}
                        </button>
                      </h3>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:max-w-[45%] sm:self-start sm:justify-end">
                      <Badge approved={item.approved} />
                      {!item.approved && (item.canApprove || item.canEdit) && (
                        <Button
                          variant={item.canApprove ? "default" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            onAction({ action: "review-goal", document, goal })
                          }
                        >
                          {item.canApprove ? "Review goal" : "Check readiness"}
                        </Button>
                      )}
                      {item.approved && canCreate && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              onAction({ action: "add-action", document, goal })
                            }
                          >
                            Add action
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              onAction({
                                action: "revise-goal",
                                document,
                                goal,
                              })
                            }
                          >
                            Revise
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    {parent
                      ? `Company objective: ${parent.record.code} · ${parent.record.title} · v${parent.reference.version}`
                      : goal.ongoingReason
                        ? `Ongoing responsibility: ${goal.ongoingReason}`
                        : "Company objective not yet selected"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        Baseline → target
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {value(goal.baseline)} → {value(goal.target)}{" "}
                        {goal.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">
                        Accountable owner
                      </p>
                      <p className="mt-1 text-sm">{owner(goal.ownerId)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Deadline</p>
                      <p className="mt-1 text-sm">
                        {goal.endDate || "Not set"}
                      </p>
                    </div>
                  </div>
                  <section
                    className="border-t border-slate-100 pt-3"
                    aria-label={`Actions for ${goal.code}`}
                    data-goal-actions={goal.id}
                  >
                    <ProgrammeActionList
                      rows={actions}
                      emptyMessage={
                        item.approved
                          ? "No actions yet. Use Add action to plan the work for this goal."
                          : "No actions yet. Approve this goal to add its delivery work."
                      }
                    />
                  </section>
                </article>
              );
            })}
          </div>
          {!visible.length && (
            <Empty
              title={
                all.length
                  ? "No department goals match these filters"
                  : "No department goals yet"
              }
            >
              {all.length
                ? "Choose another company objective or department, or clear the filters."
                : "Add a department’s own measurable contribution. Incomplete details can be saved as a draft."}
            </Empty>
          )}
        </section>
        {children}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Assign individual commitments next, then verify each outcome in
            Results &amp; review.
          </p>
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-[#52618a] px-4 py-2.5 text-xs font-semibold text-white"
            href="/leadership-excellence/performance-planning/team-individual-plans"
          >
            Continue to individual plans <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  const visible = individuals.filter(
    (document) =>
      !departmentFilter ||
      (employee(document.scopeId)?.departmentId || document.departmentId) ===
        departmentFilter,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Individual plans
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            One plan per person and planning period. Add distinct contributions
            to company objectives or department goals.
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onAction({ action: "create-individual" })}
          >
            <Plus size={14} /> Create individual plan
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Each goal is measured separately. Employee results never replace company
        achievement.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-xs">
          <Field label="Department">
            <select
              className={control}
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">All departments</option>
              {data.references.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          {visible.length} saved plans ·{" "}
          {visible.reduce(
            (total, document) => total + document.data.goals.length,
            0,
          )}{" "}
          goals
        </p>
      </div>
      {visible.map((document) => {
        const person = employee(document.scopeId),
          item = state(document, "individual", document.id);
        return (
          <article
            key={document.id}
            data-individual-id={document.id}
            className={`${panel} space-y-4`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">
                  {document.code} · {planningPeriodLabel(document.cycle)} · v
                  {item.version}
                </p>
                <h3 className="mt-3 text-base font-semibold text-slate-900">
                  {person?.name || "Employee unavailable"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {person?.position || "Position not set"} ·{" "}
                  {departmentName(
                    person?.departmentId || document.departmentId,
                  )}
                </p>
              </div>
              <Badge approved={item.approved} />
            </div>
            <div className="divide-y divide-slate-100">
              {document.data.goals.map((goal) => {
                const parent = parentInfo(goal);
                const actions = goalActionRows(data, document, goal);
                return (
                  <div
                    className="py-3 first:pt-0"
                    key={goal.id}
                    data-individual-goal-id={goal.id}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-900">
                      {goal.title || "Untitled draft goal"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {parent
                        ? `${parent.kind === "COMPANY" ? (parent.reference.itemKind === "OBJECTIVE" ? "Company objective" : "Earlier company goal") : "Department goal"} · ${parent.record.code} · ${parent.record.title} · v${parent.reference.version}`
                        : goal.ongoingReason
                          ? `Ongoing responsibility: ${goal.ongoingReason}`
                          : "Parent commitment not yet selected"}
                    </p>
                    <p className="mt-2 text-xs text-slate-700">
                      {value(goal.baseline)} → {value(goal.target)} {goal.unit}{" "}
                      · Due {goal.endDate || "Not set"}
                    </p>
                    <AssignedKpis
                      assignments={document.data.assignments.filter(
                        (assignment) => assignment.goalId === goal.id,
                      )}
                      definitions={[
                        ...(item.approved
                          ? document.versions.find(
                              (version) => version.version === item.version,
                            )?.definitions || []
                          : []),
                        ...data.definitions,
                      ]}
                    />
                    {!!actions.length && (
                      <section
                        className="mt-3"
                        aria-label={`Actions for ${goal.code}`}
                        data-goal-actions={goal.id}
                      >
                        <ProgrammeActionList rows={actions} />
                      </section>
                    )}
                  </div>
                );
              })}
            </div>
            {!document.data.goals.length && (
              <p className="text-xs text-slate-500">
                No goals added yet. Open this draft to add the person’s
                measurable contributions.
              </p>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onAction({ action: "edit-individual", document })
                }
              >
                {item.approved || !item.canEdit ? "View plan" : "Edit draft"}
              </Button>
              {!item.approved && (item.canEdit || item.canApprove) && (
                <Button
                  size="sm"
                  variant={item.canApprove ? "default" : "outline"}
                  disabled={busy}
                  onClick={() =>
                    onAction({ action: "review-individual", document })
                  }
                >
                  {item.canApprove ? "Review & approve" : "Check readiness"}
                </Button>
              )}
              {item.approved && canCreate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onAction({ action: "revise-individual", document })
                  }
                >
                  Revise plan
                </Button>
              )}
            </div>
            {!!document.versions.length && (
              <details className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                <summary className="cursor-pointer">
                  Approved versions ({document.versions.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {[...document.versions].reverse().map((version) => (
                    <section
                      key={version.version}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="font-medium text-slate-700">
                        Version {version.version} · Effective{" "}
                        {version.effectiveDate ||
                          version.approvedAt.slice(0, 10)}
                      </p>
                      {version.data.goals.map((goal) => (
                        <div key={goal.id} className="mt-2 leading-5">
                          <p>
                            {goal.title} · {value(goal.baseline)} →{" "}
                            {value(goal.target)} {goal.unit}
                          </p>
                          <AssignedKpis
                            assignments={version.data.assignments.filter(
                              (assignment) => assignment.goalId === goal.id,
                            )}
                            definitions={[
                              ...version.definitions,
                              ...data.definitions,
                            ]}
                          />
                        </div>
                      ))}
                      {version.reason && (
                        <p className="mt-2">Change reason: {version.reason}</p>
                      )}
                    </section>
                  ))}
                </div>
              </details>
            )}
          </article>
        );
      })}
      {!visible.length && (
        <Empty
          title={
            individuals.length
              ? "No individual plans match this department"
              : "No individual plans yet"
          }
        >
          {individuals.length
            ? "Choose another department to see its saved plans."
            : "Select an EMS employee and add their own measurable contributions."}
        </Empty>
      )}
      {children}
      <div className="flex justify-end">
        <Link
          className="inline-flex items-center gap-2 rounded-lg bg-[#52618a] px-4 py-2.5 text-xs font-semibold text-white"
          href="/leadership-excellence/performance-planning/results"
        >
          Continue to results &amp; review <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
