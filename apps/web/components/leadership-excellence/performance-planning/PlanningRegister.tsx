"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Search,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  Goal,
  ItemKind,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { PlanningGoalDelivery } from "./PlanningGoalDelivery";
import { ReviewedSources } from "./PlanningLinks";
import {
  objectiveHasReviewedSource,
  resolvedObjectiveSources,
  sourceKey,
} from "./PlanningSources";
import { Empty, Status } from "./PlanningUi";

type Plan = PlanningView["documents"][number];
type Edit = {
  document: PlanningDocument;
  kind: ItemKind;
  initial?: Record<string, unknown>;
};

const panel =
  "overflow-hidden rounded-xl border border-border bg-card shadow-sm";

function dateLabel(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function valueLabel(value: number | null | undefined) {
  return value == null ? "Not set" : String(value);
}

function Measure({ goal, small = false }: { goal: Goal; small?: boolean }) {
  return (
    <span className={`block ${small ? "text-sm" : "text-base"}`}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-normal text-muted-foreground">
          {valueLabel(goal.baseline)}
        </span>
        <ArrowRight size={13} className="shrink-0 text-muted-foreground/60" />
        <strong className="font-semibold text-gemba-navy">
          {valueLabel(goal.target)}
        </strong>
      </span>
      <span className="mt-1 block break-words text-[11px] font-normal text-muted-foreground">
        {goal.unit || "Unit not set"}
      </span>
    </span>
  );
}

export function PlanningRegister({
  document,
  edit,
  onStartFromSwot,
  onPlanContributions,
}: {
  document: Plan;
  edit: (value: Edit) => void;
  onStartFromSwot?: () => void;
  onPlanContributions?: (goal: Goal) => void;
}) {
  const { data } = usePlanning();
  const [search, setSearch] = useState("");
  const [pillar, setPillar] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detailTab, setDetailTab] = useState<"details" | "contributions">(
    "details",
  );
  const company = document.kind === "COMPANY";
  const personal = ["INDIVIDUAL", "TEAM", "POSITION"].includes(document.kind);
  const canEdit = document.permissions.canEdit;
  const selected = document.data.goals.find((goal) => goal.id === selectedId);
  const owner = (id: string) =>
    data.references.people.find((person) => person.id === id)?.name ||
    "Not assigned";
  const department = (id: string) =>
    data.references.departments.find((item) => item.id === id)?.name ||
    "Department unavailable";
  const query = search.trim().toLowerCase();
  const matchesGoal = (goal: Goal) =>
    `${goal.title} ${goal.code} ${goal.measure} ${owner(goal.ownerId)}`
      .toLowerCase()
      .includes(query);
  const filteredGoals = document.data.goals.filter(matchesGoal);
  const objectives = document.data.objectives.filter(
    (objective) =>
      (!pillar || objective.pillar === pillar) &&
      (`${objective.title} ${objective.code} ${objective.meaning}`
        .toLowerCase()
        .includes(query) ||
        filteredGoals.some((goal) => goal.objectiveId === objective.id)),
  );
  // Drafts may be saved before their objective is selected. Keep those goals
  // reachable in this same register so the owner can finish the relationship.
  const unlinkedGoals =
    company && !pillar
      ? filteredGoals.filter(
          (goal) =>
            !document.data.objectives.some(
              (objective) => objective.id === goal.objectiveId,
            ),
        )
      : [];
  const openGoal = (id: string) => {
    setSelectedId(id);
    setDetailTab("details");
  };
  const addGoal = (objectiveId?: string) => {
    const objective = document.data.objectives.find(
      (item) => item.id === objectiveId,
    );
    if (
      company &&
      (!objective ||
        !objectiveHasReviewedSource(objective, document, data.documents))
    ) {
      if (objective)
        edit({ document, kind: "objective", initial: { ...objective } });
      else onStartFromSwot?.();
      return;
    }
    edit({
      document,
      kind: "goal",
      initial: objective
        ? {
            objectiveId: objective.id,
            startDate: objective.startDate,
            endDate: objective.endDate,
          }
        : undefined,
    });
  };

  if (selected) {
    const objective = document.data.objectives.find(
      (item) => item.id === selected.objectiveId,
    );
    const originSources =
      objective && document.permissions.canSeeSources
        ? resolvedObjectiveSources(
            objective.sources,
            document.cycle,
            data.documents,
          )
        : [];
    const parentDocument = selected.parent
      ? data.documents.find((item) => item.id === selected.parent!.documentId)
      : undefined;
    const parentVersion = parentDocument?.versions.find(
      (version) => version.version === selected.parent?.version,
    );
    const parentGoal = parentVersion?.data.goals.find(
      (goal) => goal.id === selected.parent?.goalId,
    );
    const contributions = data.documents
      .filter((item) => item.id !== document.id)
      .flatMap((item) =>
        item.data.goals
          .filter(
            (goal) =>
              goal.parent?.documentId === document.id &&
              goal.parent.goalId === selected.id,
          )
          .map((goal) => ({ document: item, goal })),
      );
    return (
      <div className="min-w-0 space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId("")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gemba-navy"
        >
          <ArrowLeft size={15} />
          {company ? "Objectives & goals" : "Contribution goals"}
        </button>
        {company && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-gemba-navy">
            <p className="font-semibold">
              Reviewed SWOT → Objective → Linked goal
            </p>
            <p className="mt-1">
              Objective: {objective?.title || "Select a linked objective"}
            </p>
            {originSources.map((source) => (
              <p key={sourceKey(source)} className="mt-1">
                {source.finding.code} · {source.finding.title} · reviewed v
                {source.version}
              </p>
            ))}
            {!document.permissions.canSeeSources && (
              <p className="mt-1 text-muted-foreground">
                SWOT details are restricted to authorised users.
              </p>
            )}
            {canEdit &&
              objective &&
              !objectiveHasReviewedSource(
                objective,
                document,
                data.documents,
              ) && (
                <p className="mt-1 text-amber-800">
                  Link an eligible reviewed SWOT finding to this objective
                  before finalising its goals.
                </p>
              )}
          </div>
        )}
        <section className={panel}>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {selected.code}
                </span>
                <Status status={document.status} />
              </div>
              {company &&
                onPlanContributions &&
                data.actor.role !== "EMPLOYEE" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPlanContributions(selected)}
                  >
                    Plan contributions <ArrowRight size={14} />
                  </Button>
                )}
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    edit({ document, kind: "goal", initial: { ...selected } })
                  }
                >
                  <Pencil size={14} /> Edit goal
                </Button>
              )}
            </div>
            <h2 className="mt-4 break-words text-xl font-semibold leading-snug text-gemba-navy sm:text-2xl">
              {selected.title || "Untitled draft goal"}
            </h2>
            {objective && (
              <p className="mt-2 text-sm text-muted-foreground">
                Under {objective.title || "Untitled objective"}
              </p>
            )}
            {selected.parent && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <Link2
                  size={16}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <div>
                  <span className="block text-xs text-muted-foreground">
                    {document.kind === "DEPARTMENT"
                      ? "Company goal"
                      : "Department goal"}
                    {" · Approved version "}
                    {selected.parent.version}
                  </span>
                  <strong className="mt-1 block font-medium">
                    {parentGoal?.title ||
                      data.approvedParentGoals?.find(
                        (item) =>
                          item.documentId === selected.parent?.documentId &&
                          item.version === selected.parent?.version &&
                          item.goal.id === selected.parent?.goalId,
                      )?.goal.title ||
                      "Approved parent goal unavailable in this view"}
                  </strong>
                </div>
              </div>
            )}
            {(!personal ||
              selected.target != null ||
              selected.baseline != null) && (
              <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-3 sm:p-5">
                <div>
                  <p className="text-xs text-muted-foreground">Baseline</p>
                  <p className="mt-1 break-words text-2xl font-semibold text-gemba-navy">
                    {valueLabel(selected.baseline)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {selected.unit || "Unit not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="mt-1 break-words text-2xl font-semibold text-gemba-navy">
                    {valueLabel(selected.target)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {selected.unit || "Unit not set"}
                  </p>
                </div>
                <div className="col-span-2 border-t border-border pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
                  <p className="text-xs text-muted-foreground">Achieve by</p>
                  <p className="mt-2 text-sm font-semibold text-gemba-navy">
                    {dateLabel(selected.endDate)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Planning year {document.cycle}
                  </p>
                </div>
              </div>
            )}
          </div>
          <nav
            aria-label="Goal detail"
            className="flex gap-5 border-b border-border px-5 sm:px-6"
          >
            {(
              [
                ["details", "Goal details"],
                [
                  "contributions",
                  `${company ? "Department" : "Linked"} contributions (${contributions.length})`,
                ],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-current={detailTab === key ? "page" : undefined}
                onClick={() => setDetailTab(key)}
                className={`min-w-0 border-b-2 py-3 text-left text-xs font-medium sm:text-sm ${detailTab === key ? "border-gemba-navy text-gemba-navy" : "border-transparent text-muted-foreground hover:text-gemba-navy"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="space-y-5 p-5 sm:p-6">
            {detailTab === "details" ? (
              <>
                <dl className="grid gap-5 sm:grid-cols-2">
                  {[
                    [
                      "How we measure it",
                      selected.measure ||
                        (personal
                          ? "Through the assigned KPIs below"
                          : "Not set"),
                    ],
                    ["Accountable owner", owner(selected.ownerId)],
                    [
                      "Planning dates",
                      `${dateLabel(selected.startDate)} – ${dateLabel(selected.endDate)}`,
                    ],
                    ...(company
                      ? [
                          [
                            "Contributing departments",
                            selected.departmentIds.map(department).join(", ") ||
                              "Not selected",
                          ],
                        ]
                      : []),
                    ...(objective
                      ? [
                          [
                            "Primary pillar · alignment",
                            `${objective.pillar || "Not set"} · ${objective.alignments.join(", ") || "Not set"}`,
                          ],
                        ]
                      : []),
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1.5 break-words text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {selected.baseline == null && selected.baselineReason && (
                  <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    Baseline unavailable: {selected.baselineReason}
                  </p>
                )}
                <div className="border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-gemba-navy">
                    How we intend to achieve it
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                    {selected.approach || "Not described yet."}
                  </p>
                  {selected.ongoingReason && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Essential ongoing responsibility: {selected.ongoingReason}
                    </p>
                  )}
                </div>
                {objective && (
                  <details className="border-t border-border pt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gemba-navy">
                      Why this objective?
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {objective.meaning || "Meaning not yet added."}
                    </p>
                    {document.permissions.canSeeSources &&
                      objective.sources.length > 0 && (
                        <ReviewedSources sources={objective.sources} />
                      )}
                    {document.permissions.canSeeSources &&
                      objective.sourceRationale && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {objective.sourceRationale}
                        </p>
                      )}
                  </details>
                )}
                {!company && (
                  <PlanningGoalDelivery
                    document={document}
                    goal={selected}
                    edit={edit}
                  />
                )}
              </>
            ) : contributions.length ? (
              <div className="space-y-3">
                {contributions.map(({ document: contribution, goal }) => (
                  <article
                    key={`${contribution.id}/${goal.id}`}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gemba-navy">
                        {contribution.data.title || contribution.code}
                      </h3>
                      <Status status={contribution.status} />
                    </div>
                    <p className="mt-2 text-sm">
                      {goal.title || "Untitled contribution"}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <Measure goal={goal} small />
                      <p className="text-xs text-muted-foreground">
                        {owner(goal.ownerId)} · Due {dateLabel(goal.endDate)}
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Linked to approved parent version {goal.parent?.version}.
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="font-medium text-gemba-navy">
                  No linked contributions visible yet
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {company
                    ? "Departments choose this goal from the approved company plan and set their own contribution."
                    : "People can link their contributions once this department plan is approved."}
                </p>
              </div>
            )}
            <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              Company achievement comes from its own verified measures.
              Department scores and completed actions do not replace it.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gemba-navy">
            {company ? "Company objectives & goals" : "Contribution goals"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {company
              ? "A few clear priorities, with measurable goals underneath."
              : "Set a distinct result linked to the approved parent plan."}
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() =>
              company
                ? onStartFromSwot
                  ? onStartFromSwot()
                  : edit({ document, kind: "objective" })
                : addGoal()
            }
          >
            <Plus size={15} />{" "}
            {company ? "Create from SWOT" : "Add contribution"}
          </Button>
        )}
      </div>
      <div className="flex min-w-0 gap-2 sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
          />
          <input
            aria-label="Search planning register"
            className="h-10 w-full min-w-0 rounded-lg border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-gemba-navy/20"
            placeholder={
              company ? "Find an objective or goal…" : "Find a contribution…"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {company && (
          <select
            aria-label="Filter objectives by pillar"
            className="h-10 w-28 min-w-0 rounded-lg border border-input bg-card px-2 text-xs text-muted-foreground outline-none focus:ring-2 focus:ring-gemba-navy/20 sm:w-44 sm:px-3 sm:text-sm"
            value={pillar}
            onChange={(event) => setPillar(event.target.value)}
          >
            <option value="">All pillars</option>
            {data.references.pillars.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {company
        ? objectives.map((objective) => {
            const canAddGoal = objectiveHasReviewedSource(
              objective,
              document,
              data.documents,
            );
            const ownGoals = document.data.goals.filter(
              (goal) => goal.objectiveId === objective.id,
            );
            return (
              <article key={objective.id} className={panel}>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Target size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold leading-6 text-gemba-navy sm:text-base">
                        {objective.title || "Untitled draft objective"}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          {objective.code ||
                            "Code assigned after choosing a pillar"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {ownGoals.length} linked{" "}
                          {ownGoals.length === 1 ? "goal" : "goals"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{owner(objective.ownerId)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                        {objective.pillar || "Pillar not set"}
                      </span>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit objective: ${objective.title || "Untitled draft objective"}`}
                          onClick={() =>
                            edit({
                              document,
                              kind: "objective",
                              initial: { ...objective },
                            })
                          }
                        >
                          <Pencil size={15} />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {canEdit && !canAddGoal && (
                  <p className="border-t border-border/70 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800 sm:px-5">
                    This draft needs a reviewed SWOT source before you add a
                    linked goal.
                  </p>
                )}
                {ownGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="grid items-start gap-4 border-t border-border/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:px-5 xl:grid-cols-[minmax(0,1fr)_130px_auto]"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openGoal(goal.id)}
                        className="block break-words text-left text-sm font-medium text-gemba-navy hover:underline"
                      >
                        {goal.title || "Untitled draft goal"}
                      </button>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {goal.code} · {owner(goal.ownerId)} · Due{" "}
                        {dateLabel(goal.endDate)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {goal.departmentIds.map((id) => (
                          <span
                            key={id}
                            className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                          >
                            {department(id)}
                          </span>
                        ))}
                        {!goal.departmentIds.length && (
                          <span className="text-xs text-muted-foreground">
                            Contributing departments not selected
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Measure goal={goal} small />
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {goal.measure || "Measure not set"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1 xl:flex-col xl:items-start">
                      {onPlanContributions &&
                        data.actor.role !== "EMPLOYEE" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onPlanContributions(goal)}
                          >
                            Plan contributions <ArrowRight size={13} />
                          </Button>
                        )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          canEdit
                            ? edit({
                                document,
                                kind: "goal",
                                initial: { ...goal },
                              })
                            : openGoal(goal.id)
                        }
                      >
                        {canEdit ? "Edit goal" : "View goal"}
                      </Button>
                    </div>
                  </div>
                ))}
                {!ownGoals.length && (
                  <p className="border-t border-border/70 px-4 py-4 text-sm text-muted-foreground sm:px-5">
                    No linked goals yet. Start with one measurable achievement.
                  </p>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
                  <details className="min-w-0 flex-1 text-xs">
                    <summary className="cursor-pointer font-medium text-gemba-navy">
                      Why this objective?
                    </summary>
                    <div className="mt-3 space-y-3 leading-6 text-muted-foreground">
                      <p className="break-words whitespace-pre-wrap">
                        {objective.meaning ||
                          "Add the intended direction or outcome."}
                      </p>
                      {objective.alignments.length > 0 && (
                        <p>Alignment: {objective.alignments.join(", ")}</p>
                      )}
                      {document.permissions.canSeeSources &&
                        objective.sources.length > 0 && (
                          <ReviewedSources sources={objective.sources} />
                        )}
                      {document.permissions.canSeeSources &&
                        objective.sourceRationale && (
                          <p>{objective.sourceRationale}</p>
                        )}
                    </div>
                  </details>
                  {canEdit && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-gemba-navy hover:underline"
                      onClick={() => addGoal(objective.id)}
                    >
                      {canAddGoal ? <Plus size={13} /> : <Link2 size={13} />}
                      {canAddGoal
                        ? "Add linked goal"
                        : "Link reviewed SWOT first"}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        : filteredGoals.map((goal, index) => (
            <article key={goal.id} className={panel}>
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {goal.code}
                      </p>
                      <h3 className="mt-1 break-words text-base font-semibold text-gemba-navy">
                        {goal.title || "Untitled draft contribution"}
                      </h3>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openGoal(goal.id)}
                      >
                        View details
                      </Button>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            edit({
                              document,
                              kind: "goal",
                              initial: { ...goal },
                            })
                          }
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {goal.parent
                      ? (() => {
                          const parentPlan = data.documents.find(
                            (plan) => plan.id === goal.parent?.documentId,
                          );
                          const parentGoal = parentPlan?.versions
                            .find(
                              (version) =>
                                version.version === goal.parent?.version,
                            )
                            ?.data.goals.find(
                              (item) => item.id === goal.parent?.goalId,
                            );
                          const approvedParent = data.approvedParentGoals?.find(
                            (item) =>
                              item.documentId === goal.parent?.documentId &&
                              item.version === goal.parent?.version &&
                              item.goal.id === goal.parent?.goalId,
                          );
                          return `Linked to ${parentGoal?.title || approvedParent?.goal.title || `approved ${document.kind === "DEPARTMENT" ? "company" : "department"} goal`} · v${goal.parent.version}`;
                        })()
                      : goal.ongoingReason
                        ? "Essential ongoing responsibility"
                        : "Parent goal can be linked before approval"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    {(!personal ||
                      goal.target != null ||
                      goal.baseline != null) && <Measure goal={goal} small />}
                    <p className="text-xs leading-5 text-muted-foreground">
                      {goal.measure || "Measure to be added"} ·{" "}
                      {owner(goal.ownerId)} · Due {dateLabel(goal.endDate)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="border-t border-border p-4 sm:p-5">
                <PlanningGoalDelivery
                  document={document}
                  goal={goal}
                  edit={edit}
                />
              </div>
            </article>
          ))}
      {unlinkedGoals.length > 0 && (
        <section className={panel}>
          <div className="border-b border-border bg-amber-50/50 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gemba-navy">
              Goals needing an objective
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              These drafts stay in the same register. Select their objective
              before approval.
            </p>
          </div>
          {unlinkedGoals.map((goal) => (
            <button
              type="button"
              key={goal.id}
              onClick={() => openGoal(goal.id)}
              className="flex w-full items-center justify-between gap-4 border-b border-border/60 p-4 text-left last:border-b-0 hover:bg-muted/30 sm:px-5"
            >
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium text-gemba-navy">
                  {goal.title || "Untitled draft goal"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {goal.code} · {owner(goal.ownerId)}
                </span>
              </span>
              <ChevronRight
                size={15}
                className="shrink-0 text-muted-foreground"
              />
            </button>
          ))}
        </section>
      )}
      {(company
        ? !objectives.length && !unlinkedGoals.length
        : !filteredGoals.length) && (
        <Empty
          title={
            query || pillar
              ? "No matching records"
              : company
                ? "Start with a clear objective"
                : "Add your first contribution"
          }
        >
          {query || pillar
            ? "Try another search or pillar to find the item you need."
            : canEdit
              ? company
                ? "Choose a direction for the business, then add a measurable goal. You can save an incomplete draft."
                : "Choose an approved parent goal and describe this plan’s distinct contribution."
              : "The objectives and goals available to you will appear here."}
        </Empty>
      )}
    </div>
  );
}
