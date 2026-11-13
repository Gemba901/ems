"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  PlanningApiError,
  type Assignment,
  type ApprovedParentGoal,
  type Goal,
  type Objective,
  type ParentGoal,
  type Pillar,
  type PlanningDocument,
  type SourceLink,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  objectiveAllocation,
  objectiveWeightLimit,
  objectiveWeightageMessage,
  validObjectivePriority,
  validObjectiveWeightage,
} from "@/services/leadership-excellence/performance-planning/objective-weightage";
import {
  planningPeriodBounds,
  planningPeriodLabel,
} from "@/services/leadership-excellence/performance-planning/planning-period";
import { businessAlignmentLabels } from "@/services/leadership-excellence/performance-planning/business-alignment";
import { linkedFindingObjectives } from "@/services/leadership-excellence/performance-planning/finding-objectives";
import {
  programmeItemStatus,
  programmeItemVersion,
} from "@/services/leadership-excellence/performance-planning/programme";
import { usePlanning } from "./PlanningProvider";
import { DefinitionEditor } from "./PlanningEditors";
import {
  ProgrammeIndividualKpis,
  initAssignmentRows,
  serializeAssignmentRows,
  type ProgrammeAssignmentDraftRow,
} from "./ProgrammeIndividualKpis";
import {
  approvedParents,
  parentAvailableToDepartment,
  planningDocumentFingerprint,
} from "./PlanningParents";
import { reviewedSwotSources, sourceKey } from "./PlanningSources";
import {
  BusinessAlignmentFields,
  BUSINESS_ALIGNMENT_OPTIONS,
} from "./BusinessAlignmentFields";
import {
  Button,
  control,
  ErrorList,
  Field,
  Modal,
  responseLabels,
} from "./PlanningUi";

type Fields = Record<string, unknown>;
type Choice = readonly [string, string];
const directions: Choice[] = [
  ["HIGHER", "Higher is better"],
  ["LOWER", "Lower is better"],
];
const frequencies: Choice[] = [
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["MONTHLY", "Monthly"],
];
const text = (fields: Fields, key: string) => String(fields[key] ?? "");
const errorMessage = (cause: unknown) =>
  cause instanceof PlanningApiError && cause.status === 409
    ? "The planning register changed while this form was open. Your entries are still here. Copy any changes you need, then reopen the form before saving."
    : cause instanceof Error
      ? cause.message
      : "Could not save this draft. Your entries are still here.";

function useDraft(initial: Fields) {
  const [values, setValues] = useState(initial);
  const [invalidNumbers, setInvalidNumbers] = useState<Record<string, boolean>>(
    {},
  );
  const [dirty, setDirty] = useState(false);
  const set = (name: string, value: unknown) => {
    setDirty(true);
    setValues((current) => ({ ...current, [name]: value }));
  };
  const input = (
    name: string,
    label: string,
    type = "text",
    hint?: string,
    limits?: {
      min?: string | number;
      max?: string | number;
      step?: string | number;
      readOnly?: boolean;
    },
  ) => (
    <Field label={label} hint={hint}>
      <input
        className={control}
        type={type}
        value={text(values, name)}
        {...limits}
        maxLength={type === "text" ? 4000 : undefined}
        onChange={(event) => {
          set(name, event.target.value);
          if (type === "number")
            setInvalidNumbers((current) => ({
              ...current,
              [name]: event.target.validity.badInput,
            }));
        }}
      />
    </Field>
  );
  const area = (name: string, label: string, hint?: string, rows = 3) => (
    <Field label={label} hint={hint}>
      <textarea
        className={control}
        rows={rows}
        maxLength={4000}
        value={text(values, name)}
        onChange={(event) => set(name, event.target.value)}
      />
    </Field>
  );
  const select = (
    name: string,
    label: string,
    options: readonly Choice[],
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <select
        className={control}
        value={text(values, name)}
        onChange={(event) => set(name, event.target.value)}
      >
        <option value="">Select…</option>
        {text(values, name) &&
          !options.some(([id]) => id === text(values, name)) && (
            <option value={text(values, name)}>
              {text(values, name)} · Saved value
            </option>
          )}
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
  const numbers = (names: string[]) =>
    Object.fromEntries(
      names.map((name) => {
        const raw = text(values, name).trim();
        if (invalidNumbers[name] || (raw && !Number.isFinite(Number(raw))))
          throw new Error(
            `Enter a valid number for ${name}, or leave it empty for a draft.`,
          );
        return [name, raw === "" ? null : Number(raw)];
      }),
    );
  return { values, set, setValues, dirty, input, area, select, numbers };
}

function Section({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="col-span-full border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {children && <p className="mt-1 text-xs text-slate-500">{children}</p>}
    </div>
  );
}
function Footer({
  busy,
  readOnly,
  onClose,
  onSave,
  error,
}: {
  busy: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      {error ? (
        <p
          className="whitespace-pre-line text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="button" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        )}
      </div>
    </div>
  );
}
function useClose(dirty: boolean, onClose: () => void) {
  return () => {
    if (!dirty || window.confirm("Discard your unsaved changes?")) onClose();
  };
}

function ProgrammeSourcePicker({
  document,
  objectiveId,
  sources,
  onChange,
}: {
  document: PlanningDocument;
  objectiveId?: string;
  sources: SourceLink[];
  onChange: (sources: SourceLink[]) => void;
}) {
  const { data } = usePlanning();
  const [search, setSearch] = useState("");
  const all = reviewedSwotSources(data.documents, document.cycle);
  const rows = all.filter(
    (source) =>
      sources.some((item) => sourceKey(item) === sourceKey(source)) ||
      !all.some(
        (other) =>
          other.documentId === source.documentId &&
          other.findingId === source.findingId &&
          other.version > source.version,
      ),
  );
  const matches = rows.filter((source) =>
    `${source.finding.code} ${source.finding.title} ${responseLabels[source.finding.response]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const linkedElsewhere = (source: SourceLink) =>
    linkedFindingObjectives(data.documents, document.cycle, source).filter(
      (link) =>
        link.documentId !== document.id || link.objective.id !== objectiveId,
    );
  const unavailable = sources.filter(
    (source) => !rows.some((row) => sourceKey(row) === sourceKey(source)),
  );
  return (
    <details className="col-span-full rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {sources.length} linked finding{sources.length === 1 ? "" : "s"} ·
        Choose reviewed SWOT evidence
      </summary>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Reviewed strengths, opportunities, weaknesses and threats can support an
        objective. Keep their existing management decisions. The same reviewed
        finding can support multiple objectives.
      </p>
      <input
        type="search"
        className={control}
        aria-label="Find reviewed sources"
        placeholder="Search finding ID, statement or decision…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {matches.map((source) => {
          const checked = sources.some(
              (item) => sourceKey(item) === sourceKey(source),
            ),
            linkedObjectives = linkedElsewhere(source);
          return (
            <label
              key={sourceKey(source)}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm"
            >
              <input
                className="mt-1"
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? sources.filter(
                          (item) => sourceKey(item) !== sourceKey(source),
                        )
                      : [
                          ...sources.filter(
                            (item) =>
                              !(
                                item.documentId === source.documentId &&
                                item.findingId === source.findingId
                              ),
                          ),
                          {
                            documentId: source.documentId,
                            findingId: source.findingId,
                            version: source.version,
                          },
                        ],
                  )
                }
              />
              <span>
                <strong className="block font-medium">
                  {source.finding.code} ·{" "}
                  {source.finding.title || "Untitled finding"}
                </strong>
                <span className="mt-1 block text-xs text-slate-500">
                  Reviewed v{source.version} ·{" "}
                  {responseLabels[source.finding.response] || "Not decided"}
                  {linkedObjectives.length
                    ? ` · Also linked to ${linkedObjectives.map(({ objective, historical }) => `${objective.code || objective.title}${historical ? " (approved history)" : ""}`).join(", ")}`
                    : ""}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {businessAlignmentLabels(source.finding).join(", ") ||
                    "Alignment not selected"}
                </span>
              </span>
            </label>
          );
        })}
        {!matches.length && (
          <p className="py-2 text-sm text-slate-500">
            No reviewed source findings yet. Save a draft and add evidence
            later.
          </p>
        )}
        {unavailable.map((source) => (
          <div
            key={sourceKey(source)}
            className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"
          >
            <span>
              A saved source is unavailable. Its reference is preserved until
              you replace it.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange(
                  sources.filter(
                    (item) => sourceKey(item) !== sourceKey(source),
                  ),
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ProgrammeObjectiveEditor({
  document,
  initial,
  source,
  readOnly: requestedReadOnly = false,
  onClose,
  onSaved,
}: {
  document: PlanningDocument;
  initial?: Objective;
  source?: SourceLink;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, run, busy } = usePlanning();
  const [revision] = useState(data.revision);
  const [openingFingerprint] = useState(() =>
    planningDocumentFingerprint(document),
  );
  const currentDocument = data.documents.find(
    (plan) => plan.id === document.id,
  );
  const readOnly =
    requestedReadOnly ||
    !currentDocument?.permissions.canEdit ||
    document.status === "APPROVED" ||
    (!!initial &&
      programmeItemStatus(document, "objective", initial.id) === "APPROVED");
  const [error, setError] = useState("");
  const formId = useId();
  const period = planningPeriodBounds(document.cycle);
  const draft = useDraft({
    pillar: "OPX",
    direction: "HIGHER",
    reviewFrequency: "Monthly",
    ...initial,
    alignments: initial
      ? (Array.isArray(initial.alignments)
          ? initial.alignments.length === 0 && initial.alignment === "OTHER"
            ? ["OTHER"] // The former single Business focus option stored an empty QCDSMT array.
            : initial.alignments
          : [initial.alignment || ""]
        ).filter((value) =>
          BUSINESS_ALIGNMENT_OPTIONS.some(([code]) => code === value),
        )
      : ["D"],
    sources: initial?.sources || (source ? [source] : []),
    baseline: initial?.baseline ?? "",
    target: initial?.target ?? "",
    priority: initial?.priority ?? "",
    weightage: initial?.weightage ?? "",
  });
  const { values, input, area, select } = draft;
  const selectedAlignments = values.alignments as string[];
  const close = useClose(draft.dirty, onClose);
  const limit = objectiveWeightLimit(text(values, "pillar"));
  const weight =
    text(values, "weightage") === "" ? null : Number(text(values, "weightage"));
  const allocation =
    limit === null
      ? null
      : objectiveAllocation(
          [
            ...document.data.objectives.filter(
              (objective) => objective.id !== initial?.id,
            ),
            {
              id: initial?.id || "new",
              pillar: text(values, "pillar"),
              weightage: weight,
            },
          ],
          text(values, "pillar") as Pillar,
        );
  const save = async () => {
    if (busy || readOnly) return;
    try {
      const numeric = draft.numbers([
        "baseline",
        "target",
        "priority",
        "weightage",
      ]);
      if (
        numeric.priority !== null &&
        !validObjectivePriority(numeric.priority)
      )
        throw new Error(
          "Enter priority as a whole number from 1 to 10, or leave it blank.",
        );
      if (
        numeric.weightage !== null &&
        !validObjectiveWeightage(numeric.weightage, text(values, "pillar"))
      )
        throw new Error(objectiveWeightageMessage(text(values, "pillar")));
      setError("");
      const saveRevision =
        currentDocument &&
        planningDocumentFingerprint(currentDocument) === openingFingerprint
          ? data.revision
          : revision;
      const id = await run(
        "SAVE_ITEM",
        {
          kind: "objective",
          ...(initial ? { id: initial.id } : {}),
          data: {
            ...values,
            ...numeric,
            startDate:
              initial?.startDate ||
              document.data.startDate ||
              period?.startDate ||
              "",
            alignments: selectedAlignments,
            // Compatibility for older readers; multiple selections live in alignments.
            alignment:
              selectedAlignments.length === 1 ? selectedAlignments[0] : "",
            otherBusinessFocus: text(values, "otherBusinessFocus"),
            alignmentReason: initial?.alignmentReason || "",
          },
        },
        document.id,
        saveRevision,
      );
      onSaved(id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Modal
      wide
      title={
        readOnly
          ? "Company objective"
          : initial
            ? "Edit company objective"
            : "Create company objective"
      }
      onClose={close}
      scrollKey={error}
      footer={
        <Footer
          busy={busy}
          readOnly={readOnly}
          onClose={close}
          onSave={() => void save()}
          error={error}
        />
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-5"
        data-programme-objective-form
      >
        <ErrorList error={error} />
        <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-slate-700">
          One company objective, one measurable commitment.{" "}
          {readOnly
            ? "This approved version is locked. Use a dated revision to make changes."
            : "Save incomplete details now; complete the checks before approval."}
        </p>
        <fieldset
          disabled={busy || readOnly}
          className="grid min-w-0 gap-4 sm:grid-cols-2"
        >
          <div className="col-span-full">
            {input("title", "Objective title")}
          </div>
          <div className="col-span-full">
            {area("result", "What measurable result will the company achieve?")}
          </div>
          {select(
            "pillar",
            "Primary pillar",
            data.references.pillars.map((pillar) => [
              pillar.code,
              `${pillar.code} · ${pillar.name}`,
            ]),
          )}
          {select(
            "ownerId",
            "Accountable owner",
            data.references.people.map((person) => [
              person.id,
              `${person.name} · ${person.position}`,
            ]),
          )}
          <ProgrammeSourcePicker
            document={document}
            objectiveId={initial?.id}
            sources={(values.sources || []) as SourceLink[]}
            onChange={(sources) => draft.set("sources", sources)}
          />
          <div className="col-span-full">
            {area(
              "selectionReason",
              "How the objective will help in short-term and long-term period and how it is aligned with the company's vision",
            )}
          </div>
          <Section title="Priority & objective weightage">
            Enter each value manually. Weightage is saved as entered.
          </Section>
          {input(
            "priority",
            "Priority (1–10)",
            "number",
            "Enter a whole number. 10 is the highest priority; changing it does not change weightage.",
            { min: 1, max: 10, step: 1 },
          )}
          {input(
            "weightage",
            "Weightage (%)",
            "number",
            limit === null
              ? "Choose a primary pillar first."
              : `Allowed: 1–${limit}% for ${text(values, "pillar")}. Up to two decimals; leave blank if undecided.`,
            { min: 1, max: limit ?? undefined, step: "0.01" },
          )}
          {allocation && (
            <div
              className={`col-span-full rounded-lg border p-3 text-sm ${allocation.balanced ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              aria-live="polite"
            >
              <p>
                This objective:{" "}
                <strong>
                  {weight === null
                    ? "Unassigned"
                    : Number.isFinite(weight)
                      ? `${text(values, "weightage")}%`
                      : "Enter a number"}
                </strong>
              </p>
              <p className="mt-1">
                {text(values, "pillar")}: {allocation.total}% /{" "}
                {allocation.target}% · {allocation.messages.join(" ")}
              </p>
            </div>
          )}
          <Section title="Measure & timing" />
          <BusinessAlignmentFields
            values={selectedAlignments}
            businessFocus={text(values, "otherBusinessFocus")}
            onChange={(selections) => draft.set("alignments", selections)}
            onBusinessFocusChange={(value) =>
              draft.set("otherBusinessFocus", value)
            }
          />
          {input("measure", "KPI / measure")}
          {select("direction", "Success means", [
            ["HIGHER", "Increase / at least the target"],
            ["LOWER", "Reduce / at most the target"],
            ["MAINTAIN_MIN", "Maintain at least this level"],
          ])}
          {input("baseline", "Baseline", "number", undefined, { step: "any" })}
          {input("baselinePeriod", "Baseline period & sample")}
          {input("target", "Target", "number", undefined, { step: "any" })}
          {input("unit", "Unit")}
          {input(
            "endDate",
            "Deadline",
            "date",
            `Planning period: ${planningPeriodLabel(document.cycle)}.`,
            { min: period?.startDate, max: period?.endDate },
          )}
          {input("reviewFrequency", "Review frequency")}
          {area("definition", "Counting rule / KPI definition")}
          {area("dataSource", "Data source & verifier")}
          <Section title="Support & conditions" />
          {area("approach", "Approach, resources & dependencies")}
          {area("guardrails", "Quality / safety conditions to protect")}
        </fieldset>
      </form>
    </Modal>
  );
}

const parentKey = (parent: ParentGoal | null | undefined) =>
  parent
    ? `${parent.documentId}|${parent.itemKind || "GOAL"}|${parent.goalId}|${parent.version}`
    : "";
const parentRef = (parent: ApprovedParentGoal): ParentGoal => ({
  documentId: parent.documentId,
  goalId: parent.goal.id,
  version: parent.version,
  ...(parent.itemKind ? { itemKind: parent.itemKind } : {}),
});
function ParentSelect({
  parents,
  value,
  onChange,
  individual = false,
}: {
  parents: ApprovedParentGoal[];
  value: ParentGoal | null;
  onChange: (value: ParentGoal | null) => void;
  individual?: boolean;
}) {
  const options = (kind: "COMPANY" | "DEPARTMENT") =>
    parents
      .filter((parent) => parent.kind === kind)
      .map((parent) => (
        <option
          key={parentKey(parentRef(parent))}
          value={parentKey(parentRef(parent))}
        >
          {parent.goal.code} · {parent.goal.title || "Untitled commitment"} · v
          {parent.version}
        </option>
      ));
  return (
    <Field
      label={
        individual
          ? "Linked company objective or department goal"
          : "Approved company objective"
      }
      hint={
        individual
          ? "Choose an approved department goal or company objective. Different individual goals can support different departments."
          : undefined
      }
    >
      <select
        className={control}
        value={parentKey(value)}
        onChange={(event) => {
          const selected = parents.find(
            (parent) => parentKey(parentRef(parent)) === event.target.value,
          );
          onChange(selected ? parentRef(selected) : null);
        }}
      >
        <option value="">
          {individual
            ? "Choose an approved department goal or company objective"
            : "Choose an approved company objective"}
        </option>
        {value &&
          !parents.some(
            (parent) => parentKey(parentRef(parent)) === parentKey(value),
          ) && (
            <option value={parentKey(value)}>
              Saved parent link · v{value.version} (currently unavailable)
            </option>
          )}
        {individual ? (
          <>
            <optgroup label="Department goals">
              {options("DEPARTMENT")}
            </optgroup>
            <optgroup label="Company objectives">{options("COMPANY")}</optgroup>
          </>
        ) : (
          options("COMPANY")
        )}
      </select>
    </Field>
  );
}

/** Creation and the following save share an explicit revision, never a stale render closure. */
function useScopedDocument(
  kind: "DEPARTMENT" | "INDIVIDUAL",
  cycle: string,
  supplied?: PlanningDocument,
) {
  const { data, run } = usePlanning();
  const [createdId, setCreatedId] = useState("");
  const revision = useRef(data.revision);
  const openingDocuments = useRef(
    data.documents.map((plan) => ({
      id: plan.id,
      fingerprint: planningDocumentFingerprint(plan),
    })),
  );
  const created = useRef<{ id: string; scopeId: string } | null>(null);
  const ensure = async (scopeId: string) => {
    if (!scopeId)
      throw new Error(
        kind === "INDIVIDUAL"
          ? "Choose an employee from EMS to save their individual plan."
          : "Choose a department from EMS to save its goal.",
      );
    const existing =
      supplied ||
      (created.current?.scopeId === scopeId
        ? data.documents.find((plan) => plan.id === created.current?.id)
        : undefined) ||
      data.documents.find(
        (plan) =>
          plan.kind === kind &&
          plan.cycle === cycle &&
          plan.scopeId === scopeId,
      );
    if (existing) {
      const current = data.documents.find((plan) => plan.id === existing.id);
      const original = openingDocuments.current.find(
        (plan) => plan.id === existing.id,
      );
      const unchanged =
        current &&
        original?.fingerprint === planningDocumentFingerprint(current);
      return {
        id: existing.id,
        revision: unchanged ? data.revision : revision.current,
        existing: current || existing,
      };
    }
    if (created.current?.scopeId === scopeId)
      return {
        id: created.current.id,
        revision: revision.current,
        existing: undefined,
      };
    const bounds = planningPeriodBounds(cycle);
    if (!bounds) throw new Error("Select a valid planning period first.");
    // A new scope has no existing draft to overwrite. A KPI definition created
    // from this form may have advanced the workspace revision in the meantime.
    const creationRevision = data.revision;
    const id = await run(
      "CREATE_PLAN",
      { kind, cycle, scopeId, ...bounds },
      undefined,
      creationRevision,
    );
    revision.current = creationRevision + 1;
    created.current = { id, scopeId };
    setCreatedId(id);
    return { id, revision: revision.current, existing: undefined };
  };
  return { ensure, createdId };
}

export function ProgrammeDepartmentEditor({
  cycle,
  document,
  initial,
  parentObjectiveId,
  parentDocumentId,
  readOnly: requestedReadOnly = false,
  onClose,
  onSaved,
}: {
  cycle: string;
  document?: PlanningDocument;
  initial?: Goal;
  parentObjectiveId?: string;
  parentDocumentId?: string;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (documentId: string, id: string) => void;
}) {
  const { data, run, busy } = usePlanning();
  const currentDocument = document
    ? data.documents.find((plan) => plan.id === document.id)
    : undefined;
  const readOnly =
    requestedReadOnly ||
    (!!document &&
      (!currentDocument?.permissions.canEdit ||
        document.status === "APPROVED" ||
        (!!initial &&
          programmeItemStatus(document, "goal", initial.id) === "APPROVED")));
  const formId = useId(),
    [error, setError] = useState("");
  const scoped = useScopedDocument("DEPARTMENT", cycle, document);
  const [departmentId, setDepartment] = useState(document?.scopeId || "");
  const parents = approvedParents(data).filter(
    (parent) =>
      parent.kind === "COMPANY" &&
      parent.cycle === cycle &&
      parentAvailableToDepartment(data, parent, departmentId) &&
      (parent.itemKind === "OBJECTIVE" ||
        parentKey(initial?.parent) === parentKey(parentRef(parent))) &&
      (!parent.retainedFor ||
        parent.retainedFor.some(
          (link) =>
            link.documentId === document?.id && link.goalId === initial?.id,
        )),
  );
  const initialParent = parents.find(
    (parent) =>
      parent.goal.id === parentObjectiveId &&
      (!parentDocumentId || parent.documentId === parentDocumentId),
  );
  const draft = useDraft({
    ...initial,
    parent:
      initial?.parent || (initialParent ? parentRef(initialParent) : null),
    baseline: initial?.baseline ?? "",
    target: initial?.target ?? "",
  });
  const { values, input, area, select } = draft;
  const close = useClose(draft.dirty || (!!departmentId && !document), onClose);
  const period = planningPeriodBounds(cycle);
  const parent = values.parent as ParentGoal | null;
  const selectedParent = parents.find(
    (option) => parentKey(parentRef(option)) === parentKey(parent),
  );
  const identityLocked =
    !!initial &&
    !!document &&
    programmeItemVersion(document, "goal", initial.id) > 0;
  const save = async () => {
    if (busy || readOnly) return;
    try {
      const numeric = draft.numbers(["baseline", "target"]);
      const goalFields = { ...values };
      // Goal identity is assigned by the API and retained across edits.
      delete goalFields.goalNo;
      delete goalFields.departmentCode;
      delete goalFields.code;
      setError("");
      const target = await scoped.ensure(departmentId);
      const id = await run(
        "SAVE_ITEM",
        {
          kind: "goal",
          ...(initial ? { id: initial.id } : {}),
          data: {
            ...goalFields,
            ...numeric,
            startDate: initial?.startDate || period?.startDate || "",
            departmentIds: [departmentId],
          },
        },
        target.id,
        target.revision,
      );
      onSaved(target.id, id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Modal
      wide
      title={
        readOnly
          ? "Approved department goal"
          : initial
            ? "Edit department goal"
            : "Add department goal"
      }
      onClose={close}
      scrollKey={error}
      footer={
        <Footer
          busy={busy}
          readOnly={readOnly}
          onClose={close}
          onSave={() => void save()}
          error={error}
        />
      }
    >
      <form
        id={formId}
        noValidate
        data-programme-department-form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ErrorList error={error} />
        <p className="text-sm text-slate-500">
          Link the approved company objective and define this department’s
          measurable goal.{" "}
          {readOnly
            ? "This approved commitment is locked."
            : "You can save an incomplete draft."}
        </p>
        <fieldset disabled={busy || readOnly} className="min-w-0 space-y-4">
          {identityLocked && (
            <p className="rounded-lg bg-indigo-50 p-3 text-sm text-slate-700">
              Its company objective, department and generated ID stay fixed when
              revising this department goal.
            </p>
          )}
          <fieldset
            disabled={identityLocked}
            className="grid min-w-0 gap-4 sm:grid-cols-2"
          >
            <ParentSelect
              parents={parents}
              value={parent}
              onChange={(value) => draft.set("parent", value)}
            />
            <Field label="Department">
              <select
                className={control}
                value={departmentId}
                disabled={!!document || !!scoped.createdId}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="">Choose a department</option>
                {data.references.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
          <p className="text-xs text-slate-500">
            <strong className="text-slate-700">Department goal ID:</strong>{" "}
            {initial?.code || "Generated when the goal is saved"}
          </p>
          {input("title", "Department goal")}
          <div className="grid gap-4 sm:grid-cols-2">
            {input("measure", "Measure / KPI")}
            {input("unit", "Unit")}
          </div>
          {area(
            "definition",
            "Counting or measurement rule",
            "Use the same rule for the baseline and later results.",
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {input("baseline", "Baseline", "number", undefined, {
              step: "any",
            })}
            {input("target", "Target", "number", undefined, { step: "any" })}
            {select("direction", "Improvement means", directions)}
          </div>
          {input("baselinePeriod", "Baseline period & scope")}
          <div className="grid gap-4 sm:grid-cols-2">
            {select(
              "ownerId",
              "Accountable owner",
              data.references.people.map((person) => [
                person.id,
                `${person.name} · ${person.position}`,
              ]),
            )}
            {input(
              "endDate",
              "Deadline",
              "date",
              `Within ${planningPeriodLabel(cycle)}; no later than the company objective deadline.`,
              {
                min: period?.startDate,
                max: selectedParent?.goal.endDate || period?.endDate,
              },
            )}
          </div>
          {input("source", "Data source")}
          {select("frequency", "Operating review frequency", frequencies)}
        </fieldset>
      </form>
    </Modal>
  );
}

type IndividualBlock = {
  key: string;
  fields: Fields;
  invalidNumbers: Record<string, boolean>;
  assignments: ProgrammeAssignmentDraftRow[];
};
function individualBlock(
  key: string,
  initial?: Goal,
  assignments: Assignment[] = [],
): IndividualBlock {
  return {
    key,
    fields: {
      title: "",
      parent: null,
      direction: "HIGHER",
      frequency: "WEEKLY",
      ...initial,
      baseline: initial?.baseline ?? "",
      target: initial?.target ?? "",
    },
    invalidNumbers: {},
    assignments: initAssignmentRows(assignments),
  };
}

export function ProgrammeIndividualEditor({
  cycle,
  document,
  readOnly: requestedReadOnly = false,
  onClose,
  onSaved,
}: {
  cycle: string;
  document?: PlanningDocument;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (documentId: string) => void;
}) {
  const { data, run, busy } = usePlanning();
  const currentDocument = document
    ? data.documents.find((plan) => plan.id === document.id)
    : undefined;
  const readOnly =
    requestedReadOnly ||
    (!!document &&
      (!currentDocument?.permissions.canEdit ||
        document.status === "APPROVED"));
  const formId = useId(),
    nextBlock = useRef(2);
  const scoped = useScopedDocument("INDIVIDUAL", cycle, document);
  const [employeeId, setEmployee] = useState(
    document?.scopeId ||
      (data.actor.role === "EMPLOYEE" ? data.actor.employeeId : ""),
  );
  const [blocks, setBlocks] = useState<IndividualBlock[]>(() =>
    document
      ? document.data.goals.map((goal) =>
          individualBlock(
            goal.id,
            goal,
            document.data.assignments.filter((item) => item.goalId === goal.id),
          ),
        )
      : [individualBlock("new-1")],
  );
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const canDefineKpi =
    ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "HOD"].includes(data.actor.role) ||
    data.documents.some(
      (plan) =>
        plan.permissions.canRead &&
        plan.data.coordinatorIds.includes(data.actor.employeeId),
    );
  const close = useClose(dirty, onClose);
  const period = planningPeriodBounds(cycle);
  const employee = data.references.people.find(
    (person) => person.id === employeeId,
  );
  const department = data.references.departments.find(
    (item) => item.id === employee?.departmentId,
  );
  const people = data.references.people.filter(
    (person) =>
      data.actor.role !== "EMPLOYEE" || person.id === data.actor.employeeId,
  );
  const update = (
    key: string,
    field: string,
    value: unknown,
    badInput?: boolean,
  ) => {
    setDirty(true);
    setBlocks((current) =>
      current.map((block) =>
        block.key === key
          ? {
              ...block,
              fields: { ...block.fields, [field]: value },
              invalidNumbers:
                badInput === undefined
                  ? block.invalidNumbers
                  : { ...block.invalidNumbers, [field]: badInput },
            }
          : block,
      ),
    );
  };
  const save = async () => {
    if (busy || readOnly) return;
    try {
      const goals = blocks.map((block, index) => {
        let assignments: ReturnType<typeof serializeAssignmentRows>;
        try {
          assignments = serializeAssignmentRows(block.assignments);
        } catch (cause) {
          throw new Error(`Goal ${index + 1}: ${errorMessage(cause)}`);
        }
        const numeric = Object.fromEntries(
          ["baseline", "target"].map((key) => {
            const raw = text(block.fields, key).trim();
            if (
              block.invalidNumbers[key] ||
              (raw && !Number.isFinite(Number(raw)))
            )
              throw new Error(
                `Goal ${index + 1}: enter a valid ${key}, or leave it blank.`,
              );
            return [key, raw === "" ? null : Number(raw)];
          }),
        );
        return {
          ...(block.fields.id ? { id: String(block.fields.id) } : {}),
          data: {
            ...block.fields,
            ...numeric,
            ownerId: employeeId,
            startDate:
              text(block.fields, "startDate") || period?.startDate || "",
            departmentIds: employee?.departmentId
              ? [employee.departmentId]
              : [],
          },
          assignments,
          removedAssignmentIds: (document?.data.assignments || [])
            .filter(
              (assignment) =>
                assignment.goalId === block.fields.id &&
                !block.assignments.some((row) => row.id === assignment.id),
            )
            .map((assignment) => assignment.id),
        };
      });
      setError("");
      const target = await scoped.ensure(employeeId);
      if (!document && target.existing?.data.goals.length)
        throw new Error(
          "This employee already has a plan for the selected period. Open its existing plan to edit all goals together.",
        );
      const removedIds = (document?.data.goals || [])
        .filter((goal) => !blocks.some((block) => block.fields.id === goal.id))
        .map((goal) => goal.id);
      console.info(
        "[EMS-DEBUG] SAVE_GOALS payload",
        goals.map((goal) => ({
          id: (goal as { id?: string }).id,
          title: (goal.data as Record<string, unknown>).title,
          assignments: (
            goal.assignments as {
              id?: string;
              data: Record<string, unknown>;
            }[]
          ).map((assignment) => ({
            id: assignment.id,
            definitionId: assignment.data.definitionId,
            goalId: assignment.data.goalId,
          })),
        })),
      );
      await run(
        "SAVE_GOALS",
        { goals, removedIds },
        target.id,
        target.revision,
      );
      onSaved(target.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Modal
      wide
      title={
        readOnly
          ? "Approved individual plan"
          : document
            ? "Edit individual plan"
            : "Create individual plan"
      }
      onClose={close}
      scrollKey={error}
      footer={
        <Footer
          busy={busy}
          readOnly={readOnly}
          onClose={close}
          onSave={() => void save()}
          error={error}
        />
      }
    >
      <form
        id={formId}
        noValidate
        data-programme-individual-form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ErrorList error={error} />
        <p className="text-sm text-slate-500">
          Planning period {planningPeriodLabel(cycle)} ·{" "}
          {readOnly
            ? "This approved plan is locked. Use a dated revision to make changes."
            : "Save an incomplete draft and finish it later."}
        </p>
        <fieldset disabled={busy || readOnly} className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee">
              <select
                className={control}
                value={employeeId}
                disabled={!!document || !!scoped.createdId}
                onChange={(event) => {
                  setEmployee(event.target.value);
                  setDirty(true);
                }}
              >
                <option value="">Select an employee</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.position}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Planning period">
              <input
                className={control}
                value={planningPeriodLabel(cycle)}
                readOnly
              />
            </Field>
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="block text-xs text-slate-500">
                EMS department
              </span>
              {department?.name ||
                "Select an employee to view their department"}
            </p>
            <p>
              <span className="block text-xs text-slate-500">Position</span>
              {employee?.position || "—"}
            </p>
          </div>
          {blocks.map((block, index) => {
            const fields = block.fields,
              parent = fields.parent as ParentGoal | null;
            const parents = approvedParents(data).filter(
              (option) =>
                option.cycle === cycle &&
                (option.kind !== "COMPANY" ||
                  option.itemKind === "OBJECTIVE" ||
                  parentKey(parent) === parentKey(parentRef(option))) &&
                (!option.retainedFor ||
                  option.retainedFor.some(
                    (link) =>
                      link.documentId === document?.id &&
                      link.goalId === fields.id,
                  )),
            );
            const parentRow = parents.find(
              (option) => parentKey(parentRef(option)) === parentKey(parent),
            );
            const input = (
              name: string,
              label: string,
              type = "text",
              hint?: string,
            ) => (
              <Field label={label} hint={hint}>
                <input
                  className={control}
                  type={type}
                  value={text(fields, name)}
                  step={type === "number" ? "any" : undefined}
                  min={type === "date" ? period?.startDate : undefined}
                  max={
                    type === "date"
                      ? parentRow?.goal.endDate || period?.endDate
                      : undefined
                  }
                  onChange={(event) =>
                    update(
                      block.key,
                      name,
                      event.target.value,
                      type === "number"
                        ? event.target.validity.badInput
                        : undefined,
                    )
                  }
                />
              </Field>
            );
            const area = (name: string, label: string) => (
              <Field label={label}>
                <textarea
                  className={control}
                  rows={3}
                  maxLength={4000}
                  value={text(fields, name)}
                  onChange={(event) =>
                    update(block.key, name, event.target.value)
                  }
                />
              </Field>
            );
            const select = (
              name: string,
              label: string,
              options: readonly Choice[],
            ) => (
              <Field label={label}>
                <select
                  className={control}
                  value={text(fields, name)}
                  onChange={(event) =>
                    update(block.key, name, event.target.value)
                  }
                >
                  <option value="">Select…</option>
                  {text(fields, name) &&
                    !options.some(
                      ([value]) => value === text(fields, name),
                    ) && (
                      <option value={text(fields, name)}>
                        {text(fields, name)} · Saved value
                      </option>
                    )}
                  {options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            );
            return (
              <section
                key={block.key}
                data-individual-goal={block.key}
                className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Goal {index + 1}</h3>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (
                          document?.data.assignments.some(
                            (assignment) => assignment.goalId === fields.id,
                          )
                        ) {
                          setError(
                            `Goal ${index + 1} has saved KPI assignments. Remove those KPIs and save the draft before removing this goal.`,
                          );
                          return;
                        }
                        setBlocks((current) =>
                          current.filter((item) => item.key !== block.key),
                        );
                        setDirty(true);
                      }}
                    >
                      <Trash2 size={14} />
                      Remove goal
                    </Button>
                  )}
                </div>
                <ParentSelect
                  individual
                  parents={parents}
                  value={parent}
                  onChange={(value) => update(block.key, "parent", value)}
                />
                {area("title", "What will this person achieve?")}
                <div className="grid gap-4 sm:grid-cols-2">
                  {input("measure", "Measure / KPI")}
                  {input("unit", "Unit")}
                </div>
                {area("definition", "How will it be measured?")}
                <div className="grid gap-4 sm:grid-cols-3">
                  {input(
                    "baseline",
                    "Baseline (optional)",
                    "number",
                    "Missing stays empty, never zero.",
                  )}
                  {input("target", "Target", "number")}
                  {select("direction", "Improvement means", directions)}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {input(
                    "endDate",
                    "Deadline",
                    "date",
                    "Within the planning period and no later than the parent goal.",
                  )}
                  {select("frequency", "Review frequency", frequencies)}
                </div>
                {input("source", "Data source & verifier")}
                <ProgrammeIndividualKpis
                  assignments={block.assignments}
                  onChange={(assignments) => {
                    setBlocks((current) =>
                      current.map((item) =>
                        item.key === block.key
                          ? { ...item, assignments }
                          : item,
                      ),
                    );
                    setDirty(true);
                  }}
                  goalId={fields.id ? String(fields.id) : undefined}
                  ownerId={employeeId}
                  startDate={
                    text(fields, "startDate") || period?.startDate || ""
                  }
                  endDate={text(fields, "endDate") || period?.endDate || ""}
                  document={currentDocument || document}
                  readOnly={readOnly || busy}
                  onCreateDefinition={
                    canDefineKpi && !readOnly && !busy
                      ? () => setDefinitionOpen(true)
                      : undefined
                  }
                />
                <details className="rounded-lg border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Delivery notes (optional)
                  </summary>
                  <div className="mt-4 space-y-4">
                    {area("approach", "How will this person achieve the goal?")}
                    {area(
                      "noActionReason",
                      "If no separate action plan is needed, explain why",
                    )}
                  </div>
                </details>
              </section>
            );
          })}
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              disabled={blocks.length >= 50}
              onClick={() => {
                setBlocks((current) => [
                  ...current,
                  individualBlock(`new-${nextBlock.current++}`),
                ]);
                setDirty(true);
              }}
            >
              <Plus size={16} />
              Add another goal
            </Button>
          )}
          <p className="text-xs text-slate-500">
            Individual goals can support approved department goals or company
            objectives from different pillars and departments.
          </p>
        </fieldset>
      </form>
      {definitionOpen && (
        <DefinitionEditor onClose={() => setDefinitionOpen(false)} />
      )}
    </Modal>
  );
}
