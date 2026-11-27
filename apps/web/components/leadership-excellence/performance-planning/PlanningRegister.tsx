"use client";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import {
  objectiveAlignmentLabels,
  objectiveAsGoal,
  objectiveHasOwnMeasurement,
  resolveParentGoal,
} from "@/services/leadership-excellence/performance-planning/measurable-objective";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import type {
  Goal,
  ItemKind,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { PlanningGoalDelivery } from "./PlanningGoalDelivery";
import {
  ObjectiveAllocation,
  ObjectiveAllocationNotice,
  ObjectiveWeightSummary,
} from "./ObjectiveAllocation";
import { ReviewedSources } from "./PlanningLinks";
import {
  objectiveHasReviewedSource,
  resolvedObjectiveSources,
  sourceKey,
} from "./PlanningSources";
import { Button, Empty, Status } from "./PlanningUi";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
        <strong className="font-semibold text-foreground">
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
  const canCheckWeights = canEdit || document.permissions.canApprove;
  const selectedObjective = company
    ? document.data.objectives.find(
        (objective) => `objective:${objective.id}` === selectedId,
      )
    : undefined;
  const selected = selectedObjective
    ? objectiveAsGoal(selectedObjective)
    : document.data.goals.find((goal) => goal.id === selectedId);
  const legacyCompanyGoal = company && !!selected && !selectedObjective;
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
      (`${objective.title} ${objective.code} ${objective.meaning} ${objective.measure || ""}`
        .toLowerCase()
        .includes(query) ||
        filteredGoals.some((goal) => goal.objectiveId === objective.id)),
  );
  // Older company goals retain their identity, measures and existing links.
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
  const addGoal = () => edit({ document, kind: "goal" });

  if (selected) {
    const objective =
      selectedObjective ||
      document.data.objectives.find((item) => item.id === selected.objectiveId);
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
    const parentGoal =
      parentVersion && selected.parent
        ? resolveParentGoal(parentVersion.data, selected.parent)
        : undefined;
    const parentKind =
      parentDocument?.kind ||
      data.approvedParentGoals?.find(
        (item) =>
          item.documentId === selected.parent?.documentId &&
          item.version === selected.parent?.version &&
          item.goal.id === selected.parent?.goalId &&
          (item.itemKind || "GOAL") === (selected.parent?.itemKind || "GOAL"),
      )?.kind;
    const contributions = data.documents
      .filter((item) => item.id !== document.id)
      .flatMap((item) =>
        item.data.goals
          .filter(
            (goal) =>
              goal.parent?.documentId === document.id &&
              goal.parent.goalId === selected.id &&
              (goal.parent.itemKind || "GOAL") ===
                (selectedObjective ? "OBJECTIVE" : "GOAL"),
          )
          .map((goal) => ({ document: item, goal })),
      );
    return (
      <div className="min-w-0 space-y-4">
        <UiButton variant="ghost"
          type="button"
          onClick={() => setSelectedId("")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary h-auto whitespace-normal"
        >
          <ArrowLeft size={15} />
          {company ? "Company objectives" : "Contribution goals"}
        </UiButton>
        {company && (
          <div className="rounded-lg border border-info/20 bg-info-subtle/60 p-3 text-xs leading-5 text-foreground">
            <p className="font-semibold">
              {legacyCompanyGoal
                ? "Earlier company goal · retained for existing links"
                : "Reviewed SWOT → Measurable company objective"}
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
            {!legacyCompanyGoal &&
              canEdit &&
              objective &&
              !objectiveHasReviewedSource(
                objective,
                document,
                data.documents,
              ) && (
                <p className="mt-1 text-warning">
                  Link an eligible reviewed SWOT finding to this objective
                  before approving this objective.
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
                !legacyCompanyGoal &&
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
              {canEdit && !legacyCompanyGoal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    edit({
                      document,
                      kind: selectedObjective ? "objective" : "goal",
                      initial: { ...(selectedObjective || selected) },
                    })
                  }
                >
                  <Pencil size={14} />{" "}
                  {selectedObjective ? "Edit objective" : "Edit goal"}
                </Button>
              )}
            </div>
            <h2 className="mt-4 break-words text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              {selected.title || "Untitled draft goal"}
            </h2>
            {objective && !selectedObjective && (
              <p className="mt-2 text-sm text-muted-foreground">
                Under {objective.title || "Untitled objective"}
              </p>
            )}
            {selected.parent && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
                <Link2 size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <span className="block text-xs text-muted-foreground">
                    {parentKind === "COMPANY" || document.kind === "DEPARTMENT"
                      ? selected.parent.itemKind === "OBJECTIVE"
                        ? "Company objective"
                        : "Earlier company goal"
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
                          item.goal.id === selected.parent?.goalId &&
                          (item.itemKind || "GOAL") ===
                            (selected.parent?.itemKind || "GOAL"),
                      )?.goal.title ||
                      "Approved parent goal unavailable in this view"}
                  </strong>
                </div>
              </div>
            )}
            {(!personal ||
              selected.target != null ||
              selected.baseline != null) && (
              <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted p-4 sm:grid-cols-3 sm:p-5">
                <div>
                  <p className="text-xs text-muted-foreground">Baseline</p>
                  <p className="mt-1 break-words text-2xl font-semibold text-foreground">
                    {valueLabel(selected.baseline)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {selected.unit || "Unit not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="mt-1 break-words text-2xl font-semibold text-foreground">
                    {valueLabel(selected.target)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {selected.unit || "Unit not set"}
                  </p>
                </div>
                <div className="col-span-2 border-t border-border pt-3 sm:col-span-1 sm:border-0 sm:pt-0">
                  <p className="text-xs text-muted-foreground">Achieve by</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {dateLabel(selected.endDate)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Planning period {planningPeriodLabel(document.cycle)}
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
                [
                  "details",
                  selectedObjective ? "Objective details" : "Goal details",
                ],
                [
                  "contributions",
                  `Linked contributions (${contributions.length})`,
                ],
              ] as const
            ).map(([key, label]) => (
              <UiButton variant="ghost"
                key={key}
                type="button"
                aria-current={detailTab === key ? "page" : undefined}
                onClick={() => setDetailTab(key)}
                className={`h-auto whitespace-normal min-w-0 border-b-2 py-3 text-left text-xs font-medium sm:text-sm ${detailTab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-primary"}`}
              >
                {label}
              </UiButton>
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
                            `${objective.pillar || "Not set"} · ${objectiveAlignmentLabels(objective).join(", ") || "Not set"}`,
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
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    Baseline unavailable: {selected.baselineReason}
                  </p>
                )}
                <div className="border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-foreground">
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
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Why this objective?
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {objective.meaning || "Meaning not yet added."}
                    </p>
                    {objective.selectionReason && (
                      <div className="mt-3 text-sm">
                        <p className="font-medium text-foreground">
                          Why this objective was selected
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                          {objective.selectionReason}
                        </p>
                      </div>
                    )}
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
                      <h3 className="text-sm font-semibold text-foreground">
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
                <p className="font-medium text-foreground">
                  No linked contributions visible yet
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {company
                    ? "Departments and individuals can link to the approved company commitment and set their own distinct contribution."
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
          <h2 className="text-lg font-semibold text-foreground">
            {company
              ? "Company objectives"
              : personal
                ? "Individual contributions"
                : "Department contributions"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {company
              ? "Each objective states the measurable result, target and date the company has agreed."
              : "Set a distinct result linked to the approved parent plan."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {company && canCheckWeights && (
            <ObjectiveAllocation objectives={document.data.objectives} />
          )}
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
      </div>
      <div className="flex min-w-0 gap-2 sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
          />
          <Input
            aria-label="Search planning register"
            className="h-10 w-full min-w-0 rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            placeholder={
              company ? "Find an objective or goal…" : "Find a contribution…"
            }
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {company && (
          <NativeSelect
            aria-label="Filter objectives by pillar"
            className="h-10 w-28 min-w-0 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 sm:w-44 sm:px-3 sm:text-sm"
            value={pillar}
            onChange={(event) => setPillar(event.target.value)}
          >
            <option value="">All pillars</option>
            {data.references.pillars.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {company
        ? objectives.map((objective) => {
            const earlierGoals = document.data.goals.filter(
              (goal) => goal.objectiveId === objective.id,
            );
            const measurable = objectiveHasOwnMeasurement(objective);
            const contributionCount = data.documents
              .filter((plan) => plan.id !== document.id)
              .flatMap((plan) => plan.data.goals)
              .filter(
                (goal) =>
                  goal.parent?.documentId === document.id &&
                  goal.parent.goalId === objective.id &&
                  goal.parent.itemKind === "OBJECTIVE",
              ).length;
            return (
              <article
                key={objective.id}
                className={panel}
                data-objective-id={objective.id}
                id={`objective-${objective.id}`}
              >
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {objective.code || "Code generated on save"}
                        </span>
                        <Status status={document.status} />
                      </div>
                      <UiButton variant="ghost"
                        type="button"
                        onClick={() => openGoal(`objective:${objective.id}`)}
                        className="mt-3 block break-words text-left text-base font-semibold leading-6 text-foreground hover:underline h-auto whitespace-normal"
                        data-objective-title
                      >
                        {objective.title || "Untitled measurable objective"}
                      </UiButton>
                      {objective.meaning && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                          {objective.meaning}
                        </p>
                      )}
                    </div>
                    <ObjectiveWeightSummary objective={objective} />
                  </div>
                  <div
                    data-objective-measure
                    className="w-full space-y-2 border-t border-border pt-4"
                  >
                    <p className="text-xs text-muted-foreground">KPI / measurement</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {objective.measure ||
                        "Add the measure for this objective."}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="text-muted-foreground">
                        Baseline {valueLabel(objective.baseline)}
                      </span>
                      <ArrowRight
                        size={13}
                        className="shrink-0 text-muted-foreground"
                        aria-label="to"
                      />
                      <strong className="font-semibold text-foreground">
                        Target {valueLabel(objective.target)}
                      </strong>
                      <span className="break-words text-muted-foreground">
                        {objective.unit || "Unit not set"}
                      </span>
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {owner(objective.ownerId)} · Due{" "}
                      {dateLabel(objective.endDate)}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Contributing departments:{" "}
                      {(objective.departmentIds || [])
                        .map(department)
                        .join(", ") || "Not selected"}
                    </p>
                    {!measurable && (
                      <p className="text-xs leading-5 text-warning">
                        Complete this objective’s own measure and target before
                        approval.
                        {earlierGoals.length > 0
                          ? " Earlier company goals remain available below."
                          : ""}
                      </p>
                    )}
                  </div>
                  {canCheckWeights &&
                    document.status !== "APPROVED" &&
                    objective.pillar && (
                      <ObjectiveAllocationNotice
                        objectives={document.data.objectives}
                        pillar={objective.pillar}
                      />
                    )}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-xs leading-5 text-muted-foreground">
                      {objective.sources.length} linked findings ·{" "}
                      {contributionCount} linked contributions
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openGoal(`objective:${objective.id}`)}
                      >
                        View details
                      </Button>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Edit objective: ${objective.title || "Untitled draft objective"}`}
                          onClick={() =>
                            edit({
                              document,
                              kind: "objective",
                              initial: { ...objective },
                            })
                          }
                        >
                          <Pencil size={13} /> Edit objective
                        </Button>
                      )}
                      {onPlanContributions &&
                        data.actor.role !== "EMPLOYEE" &&
                        measurable && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onPlanContributions(objectiveAsGoal(objective))
                            }
                          >
                            Plan contributions <ArrowRight size={13} />
                          </Button>
                        )}
                    </div>
                  </div>
                  <details className="border-t border-border pt-3 text-xs">
                    <summary className="cursor-pointer font-medium text-foreground">
                      Alignment &amp; linked findings
                    </summary>
                    <div className="mt-3 space-y-3 leading-6 text-muted-foreground">
                      <p>
                        {objective.pillar || "Pillar not selected"} ·{" "}
                        {objectiveAlignmentLabels(objective).length
                          ? objectiveAlignmentLabels(objective).join(", ")
                          : objective.alignmentReason ||
                            "Alignment not selected"}
                      </p>
                      {document.permissions.canSeeSources &&
                        objective.sources.length > 0 && (
                          <ReviewedSources sources={objective.sources} />
                        )}
                      {objective.selectionReason && (
                        <p className="whitespace-pre-wrap break-words">
                          <span className="font-medium text-foreground">
                            Selection reason:{" "}
                          </span>
                          {objective.selectionReason}
                        </p>
                      )}
                      {document.permissions.canSeeSources &&
                        objective.sourceRationale && (
                          <p className="whitespace-pre-wrap break-words">
                            {objective.sourceRationale}
                          </p>
                        )}
                    </div>
                  </details>
                </div>
                {earlierGoals.length > 0 && (
                  <details
                    className="border-t border-border px-4 py-3 sm:px-5"
                    data-legacy-company-goals
                  >
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Earlier company goals ({earlierGoals.length}) · read only
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      These earlier records keep their original measures and
                      contribution links. They have not been merged into this
                      objective.
                    </p>
                    <div className="mt-3 divide-y divide-border">
                      {earlierGoals.map((goal) => (
                        <div
                          key={goal.id}
                          className="space-y-2 py-3"
                          data-legacy-goal-id={goal.id}
                        >
                          <UiButton variant="ghost"
                            type="button"
                            onClick={() => openGoal(goal.id)}
                            className="block break-words text-left text-sm font-medium text-foreground hover:underline h-auto whitespace-normal"
                          >
                            {goal.title || "Untitled earlier goal"}
                          </UiButton>
                          <p className="text-xs text-muted-foreground">
                            {goal.code} · {owner(goal.ownerId)} · Due{" "}
                            {dateLabel(goal.endDate)}
                          </p>
                          <p className="break-words text-sm text-muted-foreground">
                            {goal.measure || "Measure not set"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {valueLabel(goal.baseline)} →{" "}
                            {valueLabel(goal.target)}{" "}
                            {goal.unit || "Unit not set"}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openGoal(goal.id)}
                          >
                            View earlier goal
                          </Button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            );
          })
        : filteredGoals.map((goal, index) => (
            <article key={goal.id} className={panel}>
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-subtle text-sm font-semibold text-info">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">{goal.code}</p>
                      <h3 className="mt-1 break-words text-base font-semibold text-foreground">
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
                          const parentSnapshot = parentPlan?.versions.find(
                            (version) =>
                              version.version === goal.parent?.version,
                          );
                          const parentGoal =
                            parentSnapshot && goal.parent
                              ? resolveParentGoal(
                                  parentSnapshot.data,
                                  goal.parent,
                                )
                              : undefined;
                          const approvedParent = data.approvedParentGoals?.find(
                            (item) =>
                              item.documentId === goal.parent?.documentId &&
                              item.version === goal.parent?.version &&
                              item.goal.id === goal.parent?.goalId &&
                              (item.itemKind || "GOAL") ===
                                (goal.parent?.itemKind || "GOAL"),
                          );
                          return `Linked to ${parentGoal?.title || approvedParent?.goal.title || `approved ${document.kind === "DEPARTMENT" || parentPlan?.kind === "COMPANY" || approvedParent?.kind === "COMPANY" ? "company" : "department"} goal`} · v${goal.parent.version}`;
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
        <details className={panel} data-legacy-company-goals>
          <summary className="cursor-pointer p-4 text-sm font-medium text-muted-foreground sm:px-5">
            Earlier company goals without an objective ({unlinkedGoals.length})
            · read only
          </summary>
          <div className="border-b border-border px-4 pb-3 sm:px-5">
            <p className="mt-1 text-xs text-muted-foreground">
              Earlier records remain available with their original details. New
              company commitments are saved directly as measurable objectives.
            </p>
          </div>
          {unlinkedGoals.map((goal) => (
            <UiButton variant="ghost"
              type="button"
              key={goal.id}
              onClick={() => openGoal(goal.id)}
              className="flex w-full items-center justify-between gap-4 border-b border-border/60 p-4 text-left last:border-b-0 hover:bg-muted sm:px-5 h-auto whitespace-normal"
            >
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium text-foreground">
                  {goal.title || "Untitled draft goal"}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {goal.code} · {owner(goal.ownerId)}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
            </UiButton>
          ))}
        </details>
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
                ? "Describe the measurable company result, its measure, target and date. You can save an incomplete draft."
                : "Choose an approved parent goal and describe this plan’s distinct contribution."
              : "The objectives and goals available to you will appear here."}
        </Empty>
      )}
    </div>
  );
}
