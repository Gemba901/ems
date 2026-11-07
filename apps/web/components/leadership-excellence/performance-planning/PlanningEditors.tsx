"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import {
  PerformancePlanningService,
  PlanningApiError,
  type ItemKind,
  type PlanningDocument,
  type SourceLink,
  type TargetPeriod,
  type Frequency,
  type PlanningCalendar,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { PlanningEvidence } from "./PlanningEvidence";
import { QcdsmtGuidance } from "./QcdsmtGuidance";
import { FindingWeightage } from "./FindingWeightage";
import {
  compareFindingWeightage,
  findingPriority,
  findingWeightageText,
  validFindingWeightage,
} from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { planningToday } from "./PlanningLinks";
import {
  approvedParentAvailability,
  planningDocumentFingerprint,
} from "./PlanningParents";
import {
  objectiveHasReviewedSource,
  resolvedObjectiveSources,
  reviewedSwotSources,
  sourceKey,
} from "./PlanningSources";
import {
  Modal,
  Field,
  control,
  ErrorList,
  categories,
  responseLabels,
  frequencies,
} from "./PlanningUi";

type Fields = Record<string, unknown>;
const weightageInputMessage =
  "Enter a whole-number weightage from 1 to 10, or leave it blank for a draft.";
const formError = (cause: unknown) =>
  cause instanceof PlanningApiError && cause.status === 409
    ? "This form is based on an older planning version. Your entries are still here. Copy any changes you need, then close and reopen the form before saving."
    : cause instanceof Error
      ? cause.message
      : "Could not save.";
export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium text-gemba-navy">{label}</legend>
      <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-auto rounded-lg border border-border p-3">
        {options.length ? (
          options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={value.includes(o.id)}
                onChange={() =>
                  onChange(
                    value.includes(o.id)
                      ? value.filter((v) => v !== o.id)
                      : [...value, o.id],
                  )
                }
              />
              {o.name}
            </label>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            No records available in EMS.
          </p>
        )}
      </div>
    </fieldset>
  );
}

export function SourcePicker({
  cycle,
  value,
  onChange,
}: {
  cycle: string;
  value: SourceLink[];
  onChange: (value: SourceLink[]) => void;
}) {
  const { data } = usePlanning();
  const [search, setSearch] = useState("");
  const key = sourceKey;
  const rows = reviewedSwotSources(data.documents, cycle).sort((a, b) =>
    compareFindingWeightage(a.finding, b.finding),
  );
  const filtered = rows.filter((s) =>
    `${s.finding.code} ${s.finding.title} ${s.finding.pillar}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const hidden = value.filter(
    (s) => !filtered.some((r) => key(r) === key(s)),
  ).length;
  const unavailable = value.filter(
    (source) => !rows.some((row) => key(row) === key(source)),
  );
  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-medium">
        Reviewed SWOT sources
      </legend>
      <input
        aria-label="Search reviewed SWOT sources"
        className={control}
        placeholder="Search finding, code or pillar"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {value.length} selected
        {hidden ? ` · ${hidden} outside this search` : ""}. References retain
        their reviewed version.
      </p>
      {unavailable.length > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <p>
            Some saved sources are unavailable or not eligible for this planning
            year. Replace them with a reviewed finding below.
          </p>
          {unavailable.map((source, index) => (
            <div
              key={key(source)}
              className="flex items-center justify-between gap-3"
            >
              <span>Unavailable source {index + 1}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onChange(value.filter((item) => key(item) !== key(source)))
                }
              >
                Remove source
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="max-h-56 space-y-2 overflow-auto">
        {filtered.map((s) => (
          <label
            key={key(s)}
            className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={value.some((v) => key(v) === key(s))}
              onChange={() =>
                onChange(
                  value.some((v) => key(v) === key(s))
                    ? value.filter((v) => key(v) !== key(s))
                    : [
                        ...value,
                        {
                          documentId: s.documentId,
                          findingId: s.findingId,
                          version: s.version,
                        },
                      ],
                )
              }
            />
            <span>
              <span className="block text-xs text-muted-foreground">
                {s.finding.pillar} · {s.finding.code} · v{s.version}
              </span>
              {s.finding.title}
              <span className="mt-2 block">
                <FindingWeightage weightage={s.finding.weightage} />
              </span>
            </span>
          </label>
        ))}
        {!filtered.length && (
          <p className="py-3 text-sm text-muted-foreground">
            No eligible sources. Finalise a SWOT assessment first; findings
            marked Needs checking cannot support approval.
          </p>
        )}
      </div>
    </fieldset>
  );
}

export function ItemEditor({
  document,
  kind,
  initial = {},
  onClose,
  onSaved,
}: {
  document: PlanningDocument;
  kind: ItemKind;
  initial?: Fields;
  onClose: () => void;
  onSaved?: (id: string, continueToGoal: boolean) => void;
}) {
  const { data, run, busy, refresh } = usePlanning();
  const token = useAuthStore((s) => s.accessToken);
  const [formRevision, setFormRevision] = useState(data.revision);
  const [openingDocument] = useState(() =>
    planningDocumentFingerprint(document),
  );
  const [form, setForm] = useState<Fields>({
    startDate: document.data.startDate,
    endDate: document.data.endDate,
    ownerId:
      document.kind === "INDIVIDUAL"
        ? document.scopeId
        : document.data.ownerId || data.actor.employeeId,
    relatedPillars: [],
    sources: [],
    alignments: [],
    departmentIds: [],
    basis: "MANAGEMENT",
    category: "W",
    ...(kind === "finding" ? { weightage: null } : {}),
    updateFrequency: "MONTHLY",
    reviewFrequency: "MONTHLY",
    targetMode: "SAME",
    targets: [],
    calendar: data.references.calendar,
    ...initial,
  });
  const [step, setStep] = useState(0);
  // Only objectives need the source-first guided flow. Everyday contributions,
  // assignments and actions stay in one form so responsibility is never hidden
  // behind another screen and an incomplete draft can be saved at any point.
  const compactForm = kind !== "objective";
  const [invalidWeightageInput, setInvalidWeightageInput] = useState(false);
  const invalidWeightage =
    kind === "finding" &&
    (invalidWeightageInput ||
      (form.weightage != null && !validFindingWeightage(form.weightage)));
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const set = (key: string, value: unknown) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const text = (key: string) => String(form[key] ?? "");
  const ids = (key: string) => (form[key] || []) as string[];
  const calendar = (form.calendar || data.references.calendar) as
    | PlanningCalendar
    | undefined;
  const setCalendar = (key: string, value: string | number) =>
    set("calendar", { ...calendar, [key]: value });
  const close = () => {
    if (!dirty || window.confirm("Discard your unsaved changes?")) onClose();
  };
  const input = (key: string, label: string, type = "text", hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className={control}
        type={type}
        placeholder={
          type !== "text"
            ? undefined
            : key === "title"
              ? kind === "objective"
                ? "e.g. Improve equipment reliability"
                : kind === "action"
                  ? "e.g. Introduce weekly machine inspections"
                  : undefined
              : key === "measure"
                ? "e.g. Monthly unplanned downtime"
                : key === "unit"
                  ? "e.g. hours / month"
                  : undefined
        }
        maxLength={key === "title" ? 350 : 4000}
        step={type === "number" ? "any" : undefined}
        value={text(key)}
        onChange={(e) =>
          set(
            key,
            type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </Field>
  );
  const area = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <textarea
        className={control}
        rows={3}
        maxLength={4000}
        value={text(key)}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );
  const select = (
    key: string,
    label: string,
    options: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <select
        className={control}
        value={text(key)}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const person = (key: string, label: string) =>
    select(
      key,
      label,
      data.references.people
        .filter(
          (p) =>
            kind !== "goal" ||
            document.kind !== "DEPARTMENT" ||
            key !== "ownerId" ||
            ["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(p.role) ||
            (p.role === "HOD" && p.departmentId === document.departmentId),
        )
        .map((p) => ({
          id: p.id,
          name: `${p.name} · ${p.position}`,
        })),
    );
  const dates = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {input("startDate", "Start date", "date")}
      {input("endDate", "End date", "date")}
    </div>
  );
  const parentAvailability = approvedParentAvailability(
    data,
    document,
    planningToday(data.references.timeZone),
  );
  const parentOptions = parentAvailability.options;
  const currentDocument = data.documents.find(
    (item) => item.id === document.id,
  );
  // Approval of a parent can refresh an open contribution form safely when
  // the contribution's own persisted plan has not changed. Keep its inputs;
  // a concurrent edit of this plan must still fail the revision check.
  const saveRevision =
    kind === "goal" &&
    document.kind !== "COMPANY" &&
    currentDocument &&
    planningDocumentFingerprint(currentDocument) === openingDocument
      ? data.revision
      : formRevision;
  async function save(continueToGoal = false) {
    setError("");
    if (invalidWeightage) {
      setError(weightageInputMessage);
      return;
    }
    try {
      const savedId = await run(
        "SAVE_ITEM",
        {
          kind,
          id: initial.id || "",
          data:
            kind === "finding"
              ? {
                  ...form,
                  weightage: form.weightage ?? null,
                  priority: findingPriority(form.weightage),
                }
              : form,
        },
        document.id,
        saveRevision,
      );
      onClose();
      onSaved?.(savedId, continueToGoal);
    } catch (cause) {
      setError(formError(cause));
    }
  }
  async function generatePeriods() {
    try {
      const rows = await PerformancePlanningService.periods(
        token!,
        text("startDate"),
        text("endDate"),
        text("updateFrequency") as Frequency,
        {
          weekStart: calendar?.weekStart,
          fortnightAnchor: calendar?.fortnightAnchor,
          twiceMonthlySplit: calendar?.twiceMonthlySplit,
          submissionDueDays: calendar?.submissionDueDays,
          documentId: document.id,
          assignmentId: typeof initial.id === "string" ? initial.id : undefined,
          useCurrentCalendar: form.useCurrentCalendar === true,
        },
      );
      const previous = (form.targets || []) as TargetPeriod[];
      set(
        "targets",
        rows.map((p) => ({
          ...previous.find((old) => old.id === p.id),
          ...p,
          target:
            p.scheduled === false
              ? null
              : (previous.find((old) => old.id === p.id)?.target ?? null),
          upper:
            p.scheduled === false
              ? null
              : (previous.find((old) => old.id === p.id)?.upper ?? null),
        })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create periods.",
      );
    }
  }
  const definition = data.definitions.find((d) => d.id === form.definitionId);
  const selectedSources = (form.sources || []) as SourceLink[];
  const resolvedSources = resolvedObjectiveSources(
    selectedSources,
    document.cycle,
    data.documents,
  );
  const existingObjective =
    kind === "objective" && initial.id
      ? document.data.objectives.find(
          (objective) => objective.id === initial.id,
        )
      : undefined;
  const retainedRestrictedSource =
    !!existingObjective &&
    selectedSources.length === 0 &&
    objectiveHasReviewedSource(existingObjective, document, data.documents);
  const hasObjectiveSource =
    (selectedSources.length > 0 &&
      resolvedSources.length === selectedSources.length) ||
    retainedRestrictedSource;
  const selectedObjective = document.data.objectives.find(
    (objective) => objective.id === form.objectiveId,
  );
  const linkedObjectiveSources = selectedObjective
    ? resolvedObjectiveSources(
        selectedObjective.sources,
        document.cycle,
        data.documents,
      )
    : [];
  const eligibleObjectives = document.data.objectives.filter((objective) =>
    objectiveHasReviewedSource(objective, document, data.documents),
  );
  const hasGoalSource = eligibleObjectives.some(
    (objective) => objective.id === form.objectiveId,
  );
  const sourceStepBlocked =
    (kind === "objective" && !hasObjectiveSource) ||
    (kind === "goal" && document.kind === "COMPANY" && !hasGoalSource);
  const goToStep = (next: number) => {
    if (next > 0 && sourceStepBlocked) {
      setError(
        kind === "objective"
          ? "Select a reviewed SWOT finding first. You can still save an incomplete draft."
          : "Choose an objective linked to reviewed SWOT findings before continuing.",
      );
      setStep(0);
      return;
    }
    setError("");
    setStep(next);
  };
  const titles = {
    finding: "SWOT finding",
    objective: "objective",
    goal: document.kind === "COMPANY" ? "linked goal" : "contribution",
    assignment: "KPI assignment",
    action: "delivery action",
  };
  const steps: Record<ItemKind, string[]> = {
    finding: ["Finding", "Evidence & response", "Review"],
    objective: ["Reviewed SWOT", "Direction", "Ownership", "Review"],
    goal: [
      document.kind === "COMPANY" ? "Measurable result" : "Contribution",
      "Responsibility",
      "Review",
    ],
    assignment: ["Measure & owner", "Reporting", "Targets", "Review"],
    action: ["Delivery action", "Responsibility", "Review"],
  };
  const lastStep = steps[kind].length - 1;
  const isReview = step === lastStep;
  const continueToGoal =
    kind === "objective" && !initial.id && !!onSaved && hasObjectiveSource;
  const personName = (id: string) =>
    data.references.people.find((p) => p.id === id)?.name || "Not assigned";
  const value = (key: string) => text(key).trim() || "Not set";
  const frequencyName = (key: string) =>
    frequencies.find(([id]) => id === text(key))?.[1] || "Not set";
  const reviewRows: [string, string][] =
    kind === "objective"
      ? [
          ["Objective", value("title")],
          ["Meaning", value("meaning")],
          [
            "Primary pillar",
            data.references.pillars.find((p) => p.code === form.pillar)?.name ||
              "Not set",
          ],
          ["Owner", personName(text("ownerId"))],
          ["Planning dates", value("startDate") + " / " + value("endDate")],
          [
            "Reviewed sources",
            retainedRestrictedSource
              ? "Previously reviewed source retained; details restricted"
              : String(((form.sources || []) as SourceLink[]).length) +
                " selected",
          ],
        ]
      : kind === "goal"
        ? [
            ["Result", value("title")],
            ["Owner", personName(text("ownerId"))],
            ...(document.kind === "COMPANY"
              ? [
                  [
                    "Objective",
                    document.data.objectives.find(
                      (o) => o.id === form.objectiveId,
                    )?.title || "Not selected",
                  ] as [string, string],
                  [
                    "Contributing departments",
                    data.references.departments
                      .filter((department) =>
                        ids("departmentIds").includes(department.id),
                      )
                      .map((department) => department.name)
                      .join(", ") || "Not selected",
                  ] as [string, string],
                ]
              : []),
            ...(["COMPANY", "DEPARTMENT"].includes(document.kind)
              ? ([
                  ["Measure", value("measure")],
                  [
                    "Baseline to target",
                    value("baseline") +
                      " / " +
                      value("target") +
                      " " +
                      text("unit"),
                  ],
                ] as [string, string][])
              : []),
            ["Planning dates", value("startDate") + " / " + value("endDate")],
            ["Practical approach", value("approach")],
          ]
        : kind === "assignment"
          ? [
              ["KPI", definition?.name || "Not selected"],
              ["Owner", personName(text("ownerId"))],
              [
                "Provider / verifier",
                personName(text("providerId")) +
                  " / " +
                  personName(text("verifierId")),
              ],
              [
                "Update / review",
                frequencyName("updateFrequency") +
                  " / " +
                  frequencyName("reviewFrequency"),
              ],
              [
                "Targets",
                text("targetMode") === "SAME"
                  ? value("target") + " per period"
                  : String(((form.targets || []) as TargetPeriod[]).length) +
                    " reporting periods",
              ],
            ]
          : kind === "action"
            ? [
                ["Action", value("title")],
                ["Owner", personName(text("ownerId"))],
                ["Due date", value("dueDate")],
                ["Expected result", value("expectedResult")],
                ["Completion evidence", value("completionEvidence")],
              ]
            : [
                ["Finding", value("title")],
                ["Primary pillar", value("pillar")],
                [
                  "Category",
                  categories[text("category") as keyof typeof categories]
                    ?.singular || "Not set",
                ],
                ["Weightage & priority", findingWeightageText(form.weightage)],
                ["Response", responseLabels[text("response")] || "Not decided"],
              ];
  return (
    <Modal
      title={(initial.id ? "Edit " : "Create ") + titles[kind]}
      description={
        "Planning year " +
        document.cycle +
        " / " +
        (document.data.title || document.code)
      }
      onClose={close}
      wide
      scrollKey={step}
      progress={
        !compactForm && (
          <nav
            aria-label="Form steps"
            className="grid w-full gap-2 sm:gap-4"
            style={{
              gridTemplateColumns:
                "repeat(" + steps[kind].length + ", minmax(0, 1fr))",
            }}
          >
            {steps[kind].map((label, index) => (
              <button
                key={label}
                type="button"
                disabled={busy || (index > 0 && sourceStepBlocked)}
                onClick={() => goToStep(index)}
                aria-current={step === index ? "step" : undefined}
                className={
                  "min-w-0 border-t-[3px] pt-2 text-left text-[10px] leading-5 wrap-anywhere transition sm:text-xs " +
                  (step === index
                    ? "border-gemba-navy font-semibold text-gemba-navy"
                    : "border-border text-muted-foreground hover:border-gemba-navy/40")
                }
              >
                {index + 1}. {label}
              </button>
            ))}
          </nav>
        )
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {compactForm ? (
            <span className="text-xs text-muted-foreground">
              Incomplete? Save a draft and finish later.
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving..." : "Save draft"}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                !compactForm && step ? goToStep(step - 1) : close()
              }
            >
              {!compactForm && step ? (
                <>
                  <ArrowLeft size={14} /> Back
                </>
              ) : (
                "Cancel"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                busy || (!compactForm && !isReview && sourceStepBlocked)
              }
              className="h-auto min-h-9 max-w-48 whitespace-normal bg-gemba-navy py-2 text-white hover:bg-gemba-navy-deep"
              onClick={() =>
                compactForm || isReview
                  ? void save(continueToGoal)
                  : goToStep(step + 1)
              }
            >
              {compactForm || isReview ? (
                <>
                  <Check size={14} className="shrink-0" />
                  {continueToGoal
                    ? "Save objective & add goal"
                    : compactForm
                      ? "Save draft"
                      : "Save to plan"}
                </>
              ) : (
                <>
                  Continue <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form
        noValidate
        className="w-full space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (compactForm || isReview) void save(continueToGoal);
          else goToStep(step + 1);
        }}
      >
        <ErrorList error={error} />
        {compactForm && (
          <p className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Complete what you know and save a draft. Missing details can be
            filled in later, before the whole plan is approved.
          </p>
        )}
        {kind === "objective" && step > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-gemba-navy">
            <p className="font-semibold">Reviewed SWOT → Objective</p>
            {resolvedSources.map((source) => (
              <p key={sourceKey(source)} className="mt-1">
                {source.finding.code} · {source.finding.title} · reviewed v
                {source.version}
              </p>
            ))}
            {retainedRestrictedSource && (
              <p className="mt-1">
                The approved objective retains its reviewed source. Details are
                restricted to authorised users.
              </p>
            )}
          </div>
        )}
        {kind === "finding" && (compactForm || step === 0) && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {select(
                "pillar",
                "Primary pillar",
                data.references.pillars.map((p) => ({
                  id: p.code,
                  name: `${p.code} · ${p.name}`,
                })),
              )}
              {select(
                "category",
                "Category",
                Object.entries(categories).map(([id, c]) => ({
                  id,
                  name: c.singular,
                })),
              )}
            </div>
            {area(
              "title",
              "Short finding",
              "A clear statement, up to 350 characters. Required to save a finding.",
            )}
            <MultiSelect
              label="Also relevant to"
              options={data.references.pillars
                .filter((p) => p.code !== form.pillar)
                .map((p) => ({ id: p.code, name: p.code }))}
              value={ids("relatedPillars")}
              onChange={(v) => set("relatedPillars", v)}
            />
          </>
        )}
        {kind === "finding" && (compactForm || step === 1) && (
          <>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field
                    label="Weightage (1–10)"
                    hint="Use a whole number. Each finding has its own score."
                  >
                    <input
                      className={control}
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      inputMode="numeric"
                      placeholder="e.g. 8"
                      value={
                        form.weightage == null ? "" : String(form.weightage)
                      }
                      aria-invalid={invalidWeightage || undefined}
                      onChange={(event) => {
                        if (error === weightageInputMessage) setError("");
                        setInvalidWeightageInput(
                          event.target.validity.badInput,
                        );
                        const score =
                          event.target.value === ""
                            ? null
                            : Number(event.target.value);
                        setDirty(true);
                        setForm((previous) => ({
                          ...previous,
                          weightage: score,
                          priority: findingPriority(score),
                        }));
                      }}
                    />
                  </Field>
                  <div
                    className="pb-1"
                    role="status"
                    aria-label="Calculated priority"
                  >
                    <FindingWeightage weightage={form.weightage} />
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  1–3 Low · 4–6 Medium · 7–10 High. Priority is calculated
                  automatically. Leave blank while drafting; assess every
                  finding before finalising the SWOT.
                </p>
                {invalidWeightage && (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    Enter a whole number from 1 to 10.
                  </p>
                )}
              </div>
              {select(
                "response",
                "Management response",
                Object.entries(responseLabels)
                  .filter(([id]) => id)
                  .map(([id, name]) => ({ id, name })),
              )}
            </div>
            {form.response === "MONITOR" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {person("followupOwnerId", "Follow-up owner")}
                {input("reviewDate", "Review date", "date")}
              </div>
            )}
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Evidence, explanation & confidence
              </summary>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {select("basis", "Basis", [
                    { id: "MANAGEMENT", name: "Management assessment" },
                    { id: "EVIDENCED", name: "Evidence available" },
                    { id: "NEEDS_CHECKING", name: "Needs checking" },
                  ])}
                  {input("sourceUrl", "Supporting link", "url")}
                </div>
                {area("explanation", "Explanation")}
                {area("impact", "Business impact")}
                {area("evidence", "Evidence or reference")}
                {area("decisionNote", "Decision note (optional)")}
                <p className="text-xs text-muted-foreground">
                  Small supporting files can be attached after saving the
                  finding. Findings marked Needs checking cannot support a new
                  approved objective.
                </p>
              </div>
            </details>
            {!!initial.id && (
              <PlanningEvidence
                document={document}
                findingId={String(initial.id)}
                editable
                expectedRevision={formRevision}
                onUploaded={setFormRevision}
              />
            )}
          </>
        )}
        {kind === "objective" && step === 0 && (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-gemba-navy">
              <Info size={17} className="mt-1 shrink-0" />
              <p>
                Start with the reviewed SWOT findings that explain this
                objective. The goal you create next will keep this connection.
              </p>
            </div>
            {retainedRestrictedSource ? (
              <p className="rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">
                The approved objective retains its reviewed SWOT source. Source
                details are restricted to authorised users.
              </p>
            ) : (
              <SourcePicker
                cycle={document.cycle}
                value={selectedSources}
                onChange={(sources) => {
                  const first = resolvedObjectiveSources(
                    sources,
                    document.cycle,
                    data.documents,
                  )[0];
                  setDirty(true);
                  setError("");
                  setForm((current) => ({
                    ...current,
                    sources,
                    pillar: current.pillar || first?.finding.pillar || "",
                  }));
                }}
              />
            )}
            {!hasObjectiveSource && (
              <p className="text-xs leading-5 text-muted-foreground">
                Select at least one eligible source to continue. Unreviewed
                findings and findings marked Needs checking cannot be used. Save
                draft remains available while you prepare the assessment.
              </p>
            )}
          </>
        )}
        {kind === "objective" && step === 1 && (
          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {input("title", "What direction should the company take?")}
              {area(
                "meaning",
                "What does this mean for the business?",
                "One or two clear sentences describing the outcome.",
              )}
              {select(
                "pillar",
                "Primary pillar",
                data.references.pillars.map((p) => ({
                  id: p.code,
                  name: p.code + " / " + p.name,
                })),
              )}
              <MultiSelect
                label="QCDSMT alignment"
                options={[
                  { id: "Q", name: "Quality" },
                  { id: "C", name: "Cost" },
                  { id: "D", name: "Delivery" },
                  { id: "S", name: "Safety" },
                  { id: "M", name: "Morale" },
                  { id: "T", name: "Technology" },
                ]}
                value={ids("alignments")}
                onChange={(v) => set("alignments", v)}
              />
              {!ids("alignments").length && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    No alignment applies?
                  </summary>
                  <div className="mt-3">
                    {area(
                      "alignmentReason",
                      "Explain why no QCDSMT alignment applies",
                    )}
                  </div>
                </details>
              )}
            </div>
            <QcdsmtGuidance />
          </div>
        )}
        {kind === "objective" && step === 2 && (
          <>
            {person("ownerId", "Objective owner")}
            {dates}
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Explain the link to another pillar, if needed
              </summary>
              <div className="mt-3">
                {area(
                  "sourceRationale",
                  "Why these findings support the objective",
                  "Required when the selected findings do not match this objective's primary or related pillar.",
                )}
              </div>
            </details>
          </>
        )}
        {kind === "goal" && (compactForm || step === 0) && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gemba-navy">
              1. Define the result
            </h3>
            {document.kind === "COMPANY" ? (
              <>
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-gemba-navy">
                  <p className="font-semibold">
                    Reviewed SWOT → Objective → Linked goal
                  </p>
                  {selectedObjective && hasGoalSource ? (
                    <div className="mt-2 space-y-1">
                      {linkedObjectiveSources.map((source) => (
                        <p key={sourceKey(source)}>
                          {source.finding.code} · {source.finding.title} ·
                          reviewed v{source.version}
                        </p>
                      ))}
                      {!linkedObjectiveSources.length && (
                        <p>
                          Reviewed source details are restricted to authorised
                          users.
                        </p>
                      )}
                      <p className="font-medium">
                        Objective:{" "}
                        {selectedObjective.title || "Untitled draft objective"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2">
                      Choose a source-linked objective. If the objective has no
                      eligible reviewed source, edit it and link SWOT first.
                    </p>
                  )}
                </div>
                <Field label="Linked objective">
                  <select
                    className={control}
                    value={text("objectiveId")}
                    onChange={(event) => set("objectiveId", event.target.value)}
                  >
                    <option value="">
                      Select an objective linked to reviewed SWOT…
                    </option>
                    {selectedObjective && !hasGoalSource && (
                      <option value={selectedObjective.id} disabled>
                        {selectedObjective.title || selectedObjective.code} ·
                        Link reviewed SWOT first
                      </option>
                    )}
                    {eligibleObjectives.map((objective) => (
                      <option key={objective.id} value={objective.id}>
                        {objective.code || "Code pending"} /{" "}
                        {objective.title || "Untitled objective"}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field
                  label="Approved parent goal"
                  hint={
                    parentOptions.length
                      ? "Approved goals appear here automatically. The selected approved version stays linked to this contribution."
                      : undefined
                  }
                >
                  <select
                    className={control}
                    onFocus={refresh}
                    value={form.parent ? JSON.stringify(form.parent) : ""}
                    onChange={(e) =>
                      set(
                        "parent",
                        e.target.value ? JSON.parse(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">
                      {parentOptions.length
                        ? "Select an approved goal..."
                        : "No eligible approved goals yet"}
                    </option>
                    {parentOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    {!parentOptions.length &&
                      parentAvailability.unavailableOptions.length > 0 && (
                        <optgroup label="Approved — this department is not included">
                          {parentAvailability.unavailableOptions.map((o) => (
                            <option key={o.value} value={o.value} disabled>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                  </select>
                </Field>
                {!parentOptions.length && (
                  <div
                    role="status"
                    aria-label="Parent goal availability"
                    className="flex min-w-0 items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                  >
                    <Info size={18} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 space-y-3">
                      <p className="leading-6">{parentAvailability.message}</p>
                      {parentAvailability.unavailableOptions.length > 0 && (
                        <ul className="space-y-2">
                          {parentAvailability.unavailableOptions
                            .slice(0, 3)
                            .map((goal) => (
                              <li
                                key={goal.value}
                                className="break-words rounded-md border border-amber-200 bg-white/70 p-3"
                              >
                                <p className="font-medium">
                                  {goal.code} · {goal.title}
                                </p>
                                <p className="mt-1 text-xs leading-5">
                                  Contributing departments:{" "}
                                  {goal.departmentNames.join(", ") ||
                                    "None selected"}
                                </p>
                              </li>
                            ))}
                        </ul>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={busy}
                      >
                        Refresh approved goals
                      </Button>
                    </div>
                  </div>
                )}
                <details
                  className="rounded-lg border border-border p-3"
                  open={form.ongoingReason ? true : undefined}
                >
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    An essential ongoing responsibility instead?
                  </summary>
                  <div className="mt-3">
                    {area(
                      "ongoingReason",
                      "Explain the responsibility",
                      "If no parent goal applies, explain why this distinct contribution is needed.",
                    )}
                  </div>
                </details>
              </>
            )}
            {area(
              "title",
              document.kind === "COMPANY"
                ? "What measurable result do you want?"
                : "What will you contribute?",
            )}
            {["COMPANY", "DEPARTMENT"].includes(document.kind) && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {input("measure", "How will you measure it?")}
                  {input("unit", "Unit")}
                  {input("baseline", "Baseline - current value", "number")}
                  {input("target", "Target - desired value", "number")}
                </div>
                {(form.baseline == null || form.baseline === "") && (
                  <details
                    className="rounded-lg border border-border p-3"
                    open={form.baselineReason ? true : undefined}
                  >
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      No baseline available?
                    </summary>
                    <div className="mt-3">
                      {input(
                        "baselineReason",
                        "Explain why the baseline is unavailable",
                        "text",
                        "Leave it blank rather than using zero for missing data.",
                      )}
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
        )}
        {kind === "goal" && (compactForm || step === 1) && (
          <section className="space-y-4 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-gemba-navy">
              2. Responsibility & timing
            </h3>
            {person(
              "ownerId",
              document.kind === "DEPARTMENT"
                ? "Accountable HOD / function manager"
                : "Who owns this result?",
            )}
            {dates}
            {document.kind === "COMPANY" && (
              <div className="space-y-2">
                <MultiSelect
                  label="Contributing departments"
                  options={data.references.departments}
                  value={ids("departmentIds")}
                  onChange={(v) => set("departmentIds", v)}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  After approval, this goal will appear in these
                  departments&apos; plans for the same planning year. To include
                  another department later, add it in a revision and approve
                  that revision.
                </p>
              </div>
            )}
            {area(
              "approach",
              "How can this result be achieved?",
              "Describe a practical approach using the available resources.",
            )}
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Delivery arrangements / existing work
              </summary>
              <div className="mt-3">
                {area(
                  "noActionReason",
                  document.kind === "COMPANY"
                    ? "Where will delivery actions be planned?"
                    : "If no separate action is needed, explain why",
                  document.kind === "COMPANY"
                    ? "For example, Production will plan inspections in its department plan."
                    : "Leave blank when you will add or link delivery actions after saving.",
                )}
              </div>
            </details>
            {document.kind !== "COMPANY" && (
              <p className="text-xs text-muted-foreground">
                After saving, assign relevant KPIs and add or link the delivery
                actions.
              </p>
            )}
          </section>
        )}
        {kind === "assignment" && (compactForm || step === 0) && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gemba-navy">
              1. Measure & responsibility
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {select(
                "goalId",
                "Contribution goal",
                document.data.goals.map((g) => ({
                  id: g.id,
                  name: g.title || g.code,
                })),
              )}
              {select(
                "definitionId",
                "KRA / KPI definition",
                data.definitions.map((d) => ({
                  id: d.id,
                  name: `${data.kras.find((k) => k.id === d.kraId)?.name} / ${d.name}`,
                })),
              )}
            </div>
            {definition && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <strong>{definition.name}</strong>
                <p>{definition.meaning}</p>
                <p className="mt-1 text-xs">
                  Unit: {definition.unit} · {definition.direction}
                </p>
                <details className="mt-3 border-t border-border pt-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Calculation & aggregation
                  </summary>
                  <p className="mt-2 leading-5">
                    {definition.formula === "DIRECT"
                      ? definition.inputA
                      : `${definition.inputA} ÷ ${definition.inputB}${definition.formula === "PERCENT" ? " × 100" : ""}`}
                    {" · "}Aggregation: {definition.aggregation}
                  </p>
                </details>
              </div>
            )}
            {dates}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {person("ownerId", "Accountable KPI owner")}
              {input("source", "Data source")}
              {person("providerId", "Data provider")}
              {person("verifierId", "Independent verifier")}
              {input("baseline", "Baseline", "number")}
            </div>
            {form.baseline == null && (
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  No baseline available?
                </summary>
                <div className="mt-3">
                  {input("baselineReason", "Why the baseline is unavailable")}
                </div>
              </details>
            )}
          </section>
        )}
        {kind === "assignment" && (compactForm || step === 1) && (
          <section className="space-y-4 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-gemba-navy">
              2. Reporting
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {select(
                "updateFrequency",
                "Result update frequency",
                frequencies.map(([id, name]) => ({ id, name })),
              )}
              {select(
                "reviewFrequency",
                "Management review frequency",
                frequencies.map(([id, name]) => ({ id, name })),
              )}
            </div>
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Reporting calendar & submission deadline
              </summary>
              <div className="mt-3 space-y-4">
                {!!initial.id && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.useCurrentCalendar === true}
                      onChange={(event) => {
                        setDirty(true);
                        setForm((current) => ({
                          ...current,
                          useCurrentCalendar: event.target.checked,
                          calendar: event.target.checked
                            ? data.references.calendar
                            : initial.calendar || data.references.calendar,
                          targets: event.target.checked
                            ? []
                            : initial.targets || [],
                        }));
                      }}
                    />
                    <span>
                      Use the current organisation calendar
                      <span className="block text-xs text-muted-foreground">
                        Changing calendars clears the period target grid.
                        Generate it again and review targets before saving;
                        approved changes still require a plan revision.
                      </span>
                    </span>
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  {calendar?.source === "AREA_02"
                    ? `Approved organisation calendar · version ${calendar.version}`
                    : "Uses the organisation's work settings and recorded holidays. The approved Performance Rules calendar is not connected yet."}{" "}
                  · {calendar?.timeZone || data.references.timeZone || "UTC"}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Week starts on">
                    <select
                      disabled={calendar?.source === "AREA_02"}
                      className={control}
                      value={calendar?.weekStart ?? 1}
                      onChange={(event) =>
                        setCalendar("weekStart", Number(event.target.value))
                      }
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Every-two-weeks anchor date">
                    <input
                      disabled={calendar?.source === "AREA_02"}
                      className={control}
                      type="date"
                      value={calendar?.fortnightAnchor || ""}
                      onChange={(event) =>
                        setCalendar("fortnightAnchor", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Twice-monthly first period ends on day">
                    <input
                      disabled={calendar?.source === "AREA_02"}
                      className={control}
                      type="number"
                      min={1}
                      max={28}
                      value={calendar?.twiceMonthlySplit ?? 15}
                      onChange={(event) =>
                        setCalendar(
                          "twiceMonthlySplit",
                          Number(event.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label="Submit within days after the period ends"
                    hint="Separate from how often results are updated or management reviews them."
                  >
                    <input
                      disabled={calendar?.source === "AREA_02"}
                      className={control}
                      type="number"
                      min={0}
                      max={365}
                      value={calendar?.submissionDueDays ?? 0}
                      onChange={(event) =>
                        setCalendar(
                          "submissionDueDays",
                          Number(event.target.value),
                        )
                      }
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Daily non-working dates are Not scheduled. They have no target
                  and are never treated as zero. Saved assignments retain their
                  calendar version.
                </p>
              </div>
            </details>
          </section>
        )}
        {kind === "assignment" && (compactForm || step === 2) && (
          <section className="space-y-4 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-gemba-navy">
              3. Period targets
            </h3>
            {select("targetMode", "Period target method", [
              { id: "SAME", name: "Same target for every period" },
              { id: "VARIED", name: "Set each period separately" },
            ])}
            {form.targetMode === "SAME" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {input(
                  "target",
                  definition?.direction === "RANGE"
                    ? "Lower limit"
                    : "Target for each period",
                  "number",
                )}
                {definition?.direction === "RANGE" &&
                  input("upper", "Upper limit", "number")}
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void generatePeriods()}
                >
                  Generate / refresh periods
                </Button>
                <div className="max-h-80 overflow-auto">
                  {((form.targets || []) as TargetPeriod[]).map((p, index) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-2 gap-3 border-b border-border py-2 sm:grid-cols-3"
                    >
                      <span className="text-xs self-center">
                        {p.label}
                        {p.scheduled === false ? (
                          <span className="block text-muted-foreground">
                            Not scheduled
                          </span>
                        ) : p.submissionDate ? (
                          <span className="block text-muted-foreground">
                            Submit by {p.submissionDate}
                          </span>
                        ) : null}
                      </span>
                      <input
                        aria-label={`Target ${p.label}`}
                        className={control}
                        type="number"
                        disabled={p.scheduled === false}
                        step="any"
                        value={p.target ?? ""}
                        onChange={(e) =>
                          set(
                            "targets",
                            (form.targets as TargetPeriod[]).map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    target:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : r,
                            ),
                          )
                        }
                      />
                      {definition?.direction === "RANGE" && (
                        <input
                          aria-label={`Upper limit ${p.label}`}
                          className={control}
                          type="number"
                          disabled={p.scheduled === false}
                          step="any"
                          value={p.upper ?? ""}
                          onChange={(e) =>
                            set(
                              "targets",
                              (form.targets as TargetPeriod[]).map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      upper:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Annual targets are never divided automatically. Blank targets
              remain missing; zero is a valid value.
            </p>
          </section>
        )}
        {kind === "action" && (compactForm || step === 0) && (
          <>
            {input("title", "Delivery action")}
            {select(
              "goalId",
              "Contribution goal",
              document.data.goals.map((g) => ({
                id: g.id,
                name: g.title || g.code,
              })),
            )}
          </>
        )}
        {kind === "action" && (compactForm || step === 1) && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {person("ownerId", "Responsible person")}
              {input("dueDate", "Due date", "date")}
            </div>
            {area("expectedResult", "Expected result")}
            {area(
              "completionEvidence",
              "Evidence required to confirm completion",
            )}
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Support & dependencies
              </summary>
              <div className="mt-3 space-y-4">
                {area("support", "Support / dependencies (optional)")}
                {select(
                  "parentActionId",
                  "Parent action (optional)",
                  document.data.actions
                    .filter((a) => a.id !== initial.id)
                    .map((a) => ({ id: a.id, name: a.title || a.code })),
                )}
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-sm">
                Related reviewed SWOT findings (optional)
              </summary>
              <div className="mt-3">
                <SourcePicker
                  cycle={document.cycle}
                  value={(form.sources || []) as SourceLink[]}
                  onChange={(v) => set("sources", v)}
                />
              </div>
            </details>
          </>
        )}
        {(compactForm || isReview) && (
          <>
            <details
              open={!compactForm || undefined}
              className="rounded-xl border border-border bg-muted/25 p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold text-gemba-navy">
                Check your draft
              </summary>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {reviewRows.map(([label, entry]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-gemba-navy">
                      {entry}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
            {!compactForm && (
              <div className="flex gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-xs leading-5 text-muted-foreground">
                <Info size={17} className="mt-0.5 shrink-0 text-blue-600" />
                <p>
                  Save this draft to the plan. Missing details can be filled in
                  later; the whole plan is checked before approval.
                  {continueToGoal
                    ? " Next, add the first measurable goal under this objective."
                    : ""}
                </p>
              </div>
            )}
            {!!initial.id &&
              !document.versions.some((v) =>
                [
                  ...v.data.findings,
                  ...v.data.objectives,
                  ...v.data.goals,
                  ...v.data.assignments,
                  ...v.data.actions,
                ].some((item) => item.id === initial.id),
              ) && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Delete this unreviewed draft item? Linked records cannot be deleted.",
                      )
                    )
                      return;
                    try {
                      await run(
                        "DELETE_ITEM",
                        { kind, id: initial.id },
                        document.id,
                        formRevision,
                      );
                      onClose();
                    } catch (e) {
                      setError(formError(e));
                    }
                  }}
                >
                  Delete draft item
                </Button>
              )}
          </>
        )}
        <p className="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
          {initial.code
            ? "Code: " + String(initial.code)
            : "Code is generated when you save."}{" "}
          / Planning year {document.cycle}
        </p>
      </form>
    </Modal>
  );
}

export function PlanSettings({
  document,
  onClose,
}: {
  document: PlanningDocument;
  onClose: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const [formRevision] = useState(data.revision);
  const [form, setForm] = useState({ ...document.data }),
    [error, setError] = useState("");
  const access = data.documents.find((d) => d.id === document.id)!.permissions;
  const canChangeOwner = document.kind !== "SWOT" || access.canConfigure;
  const change = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const people = data.references.people.map((p) => ({
    id: p.id,
    name: `${p.name} · ${p.position}`,
  }));
  async function save() {
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        startDate: form.startDate,
        endDate: form.endDate,
      };
      if (canChangeOwner) payload.ownerId = form.ownerId;
      if (access.canConfigure)
        Object.assign(payload, {
          approverId: form.approverId,
          contributorIds: form.contributorIds,
          coordinatorIds: form.coordinatorIds,
        });
      await run("SAVE_SETTINGS", payload, document.id, formRevision);
      onClose();
    } catch (e) {
      setError(formError(e));
    }
  }
  return (
    <Modal title="Plan settings & access" onClose={onClose}>
      <div className="space-y-5">
        <ErrorList error={error} />
        <Field label="Plan name">
          <input
            className={control}
            value={form.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {["startDate", "endDate"].map((key) => (
            <Field
              key={key}
              label={key === "startDate" ? "Start date" : "End date"}
            >
              <input
                className={control}
                type="date"
                value={form[key as "startDate"]}
                onChange={(e) => change(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        {["ownerId", ...(access.canConfigure ? ["approverId"] : [])].map(
          (key) => (
            <Field
              key={key}
              label={
                key === "ownerId" ? "Plan owner" : "Single authorised approver"
              }
            >
              <select
                className={control}
                value={form[key as "ownerId"]}
                disabled={key === "ownerId" && !canChangeOwner}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="">Select...</option>
                {people
                  .filter(
                    (p) =>
                      key !== "approverId" ||
                      data.references.people.some(
                        (m) =>
                          m.id === p.id &&
                          (["ADMIN", "SUPER_ADMIN", "MANAGEMENT"].includes(
                            m.role,
                          ) ||
                            (!["SWOT", "COMPANY"].includes(document.kind) &&
                              m.role === "HOD" &&
                              m.departmentId === document.departmentId)),
                      ),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          ),
        )}
        {access.canConfigure && (
          <>
            <MultiSelect
              label="Planning coordinators"
              options={people}
              value={form.coordinatorIds}
              onChange={(v) => change("coordinatorIds", v)}
            />
            {document.kind === "SWOT" && (
              <MultiSelect
                label="Selected SWOT contributors (confidential access)"
                options={people}
                value={form.contributorIds}
                onChange={(v) => change("contributorIds", v)}
              />
            )}
            {["TEAM", "POSITION"].includes(document.kind) && (
              <section className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">Plan membership</h3>
                <p className="text-xs text-muted-foreground">
                  {form.contributorIds
                    .map(
                      (id) =>
                        data.references.people.find(
                          (person) => person.id === id,
                        )?.name || "Former member",
                    )
                    .join(", ") || "No members assigned"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Approved membership is preserved after transfers. Refresh
                  members explicitly in this draft and approve the revision to
                  change responsibility.
                </p>
                <Button
                  variant="outline"
                  disabled={
                    document.kind === "POSITION"
                      ? !(data.references.positions || []).some(
                          (position) => position.id === document.scopeId,
                        )
                      : !data.references.teams.some(
                          (team) => team.id === document.scopeId,
                        )
                  }
                  onClick={() =>
                    change(
                      "contributorIds",
                      document.kind === "POSITION"
                        ? data.references.positions?.find(
                            (position) => position.id === document.scopeId,
                          )?.holderIds || []
                        : data.references.teams.find(
                            (team) => team.id === document.scopeId,
                          )?.memberIds || [],
                    )
                  }
                >
                  Use current{" "}
                  {document.kind === "POSITION"
                    ? "position holders"
                    : "team members"}
                </Button>
              </section>
            )}
          </>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Save settings
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DefinitionEditor({ onClose }: { onClose: () => void }) {
  const { data, run, busy } = usePlanning();
  const [formRevision] = useState(data.revision);
  const [form, setForm] = useState<Record<string, string>>({
      direction: "LOWER",
      formula: "DIRECT",
      aggregation: "SUM",
    }),
    [error, setError] = useState("");
  const field = (key: string, label: string, options?: [string, string][]) => (
    <Field label={label}>
      {options ? (
        <select
          className={control}
          value={form[key] || ""}
          onChange={(e) =>
            setForm({
              ...form,
              [key]: e.target.value,
              ...(key === "formula"
                ? { aggregation: e.target.value === "DIRECT" ? "SUM" : "RATIO" }
                : {}),
              ...(key === "kraId" && e.target.value
                ? { adaptedKraFromId: "", kraName: "" }
                : {}),
            })
          }
        >
          <option value="">Select...</option>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={control}
          value={form[key] || ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      )}
    </Field>
  );
  return (
    <Modal title="Create or adapt a KPI definition" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await run("SAVE_DEFINITION", form, undefined, formRevision);
            onClose();
          } catch (c) {
            setError(formError(c));
          }
        }}
      >
        <ErrorList error={error} />
        <Field
          label="Start from an existing KPI (optional)"
          hint="Select a definition to adapt it. The original remains unchanged and its reference is retained."
        >
          <select
            className={control}
            value={form.adaptedFromId || ""}
            onChange={(e) => {
              const definition = data.definitions.find(
                (item) => item.id === e.target.value,
              );
              if (!definition) {
                setForm({
                  direction: "LOWER",
                  formula: "DIRECT",
                  aggregation: "SUM",
                });
                return;
              }
              setForm({
                adaptedFromId: definition.id,
                kraId: definition.kraId,
                name: `${definition.name} (adapted)`,
                meaning: definition.meaning,
                unit: definition.unit,
                direction: definition.direction,
                formula: definition.formula,
                aggregation: definition.aggregation,
                inputA: definition.inputA,
                inputB: definition.inputB,
              });
            }}
          >
            <option value="">Create a new definition</option>
            {data.definitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.code} · {definition.name}
              </option>
            ))}
          </select>
        </Field>
        {field(
          "kraId",
          "Responsibility area (KRA)",
          data.kras.map((k) => [k.id, k.name]),
        )}
        {!form.kraId && (
          <>
            <Field
              label="Adapt an existing KRA (optional)"
              hint="Keep a reference to the responsibility area you started from; the original is unchanged."
            >
              <select
                className={control}
                value={form.adaptedKraFromId || ""}
                onChange={(event) => {
                  const source = data.kras.find(
                    (kra) => kra.id === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    adaptedKraFromId: source?.id || "",
                    kraName: source ? `${source.name} (adapted)` : "",
                  }));
                }}
              >
                <option value="">Create a new KRA</option>
                {data.kras.map((kra) => (
                  <option key={kra.id} value={kra.id}>
                    {kra.code} · {kra.name}
                  </option>
                ))}
              </select>
            </Field>
            {field("kraName", "New KRA name")}
          </>
        )}
        {field("name", "KPI name")}
        {field("meaning", "Meaning")}
        {field("unit", "Unit")}
        {field("direction", "Good performance means", [
          ["HIGHER", "Higher"],
          ["LOWER", "Lower"],
          ["RANGE", "Within a range"],
          ["ZERO", "Zero"],
          ["MILESTONE", "Milestone achieved"],
        ])}
        {field("formula", "Calculation", [
          ["DIRECT", "Direct reading"],
          ["RATIO", "A / B"],
          ["PERCENT", "A / B × 100"],
        ])}
        {field("inputA", "Input A / reading name")}
        {form.formula !== "DIRECT" && field("inputB", "Input B / denominator")}
        {field(
          "aggregation",
          "Across periods",
          form.formula !== "DIRECT"
            ? [["RATIO", "Recalculate from total inputs"]]
            : [
                ["SUM", "Sum"],
                ["CLOSING", "Closing value"],
                ["MILESTONE", "Milestone"],
              ],
        )}
        <p className="text-xs text-muted-foreground">
          Definitions are shared. Each plan keeps its own targets and
          frequencies. Existing definitions are preserved when you adapt them.
        </p>
        <Button type="submit" disabled={busy}>
          Save definition
        </Button>
      </form>
    </Modal>
  );
}
