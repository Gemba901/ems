"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Info,
  Link2,
  Loader2,
  LockKeyhole,
  Save,
  Target,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import type {
  Dependencies,
  GoalData,
  GoalView,
  ObjectiveView,
} from "@/services/strategic-objectives";
import {
  editGoalDraft,
  emptyGoal,
  smartReadiness,
} from "@/services/strategic-objectives/rules";
import { STRATEGIC_OBJECTIVES_ROUTES as routes } from "@/services/strategic-objectives/routes";
import { useStrategicObjectives } from "./StrategicObjectivesShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";

const panel =
  "rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6";
const input =
  "mt-2 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-success focus:ring-2 focus:ring-success disabled:bg-muted disabled:text-muted-foreground";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success disabled:opacity-60";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success disabled:opacity-60";
type FormOptions = {
  refs: Dependencies;
  objective: ObjectiveView;
  goal: GoalView | null;
};

function FormNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`${panel} max-w-2xl`}>
      <LockKeyhole className="mb-4 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{children}</p>
      <Link href={routes.register} className={`${secondary} mt-5`}>
        Open register
      </Link>
    </section>
  );
}

export function GoalForm({
  objectiveId,
  goalId,
  invalidGoalId = false,
}: {
  objectiveId?: string;
  goalId?: string;
  invalidGoalId?: boolean;
}) {
  const { service, session } = useStrategicObjectives();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!session?.canEdit || !objectiveId || invalidGoalId) return;
    let active = true;
    Promise.all([
      service.getObjectives(),
      service.getPillars(),
      service.getEmployees(),
      service.getDepartments(),
      service.getPlanningPeriods(),
    ])
      .then(
        ([objectives, pillars, employees, departments, planningPeriods]) => {
          if (!active) return;
          const objective = objectives.find((item) => item.id === objectiveId);
          if (!objective) {
            setError(
              "The linked objective is not available in this demo session. Open the register to choose an objective. Reloading resets the sample plan.",
            );
            return;
          }
          const goal =
            objective.goals.find((item) => item.id === goalId) ?? null;
          if (goalId && !goal) {
            setError(
              "This goal does not belong to the selected objective, or is no longer available. Open it from the register.",
            );
            return;
          }
          setOptions({
            objective,
            goal,
            refs: { pillars, employees, departments, planningPeriods },
          });
        },
      )
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the goal form.",
          );
      });
    return () => {
      active = false;
    };
  }, [service, session?.canEdit, objectiveId, goalId, invalidGoalId, attempt]);

  if (!session?.canEdit)
    return (
      <FormNotice title="Leadership access required">
        Only CEO / Authorised Leadership can create or edit goal drafts.
      </FormNotice>
    );
  if (!objectiveId || invalidGoalId)
    return (
      <FormNotice title="Choose a goal from the register">
        Use Add Goal under an objective, or Edit goal draft on an existing goal.
        Every goal belongs to exactly one objective.
      </FormNotice>
    );
  if (error)
    return (
      <section className={panel}>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="ghost"
            type="button"
            className={`${secondary} h-auto whitespace-normal`}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
          <Link href={routes.register} className={secondary}>
            Open register
          </Link>
        </div>
      </section>
    );
  if (!options)
    return (
      <p
        role="status"
        className="flex items-center gap-2 py-10 text-sm text-muted-foreground"
      >
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Loading goal fields…
      </p>
    );
  if (options.goal && options.goal.current.status !== "Draft")
    return (
      <FormNotice
        title={
          options.goal.current.status === "Approved"
            ? "Approved goal is locked"
            : "This goal has a pending revision"
        }
      >
        This form edits goal drafts only. Approved changes require a reason and
        effective date through the revision workflow.
      </FormNotice>
    );
  return <GoalDraftForm options={options} />;
}

function GoalDraftForm({ options }: { options: FormOptions }) {
  const { service, registerLeaveGuard, confirmLeave } =
    useStrategicObjectives();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<GoalData>(() =>
    structuredClone(options.goal?.current.data ?? emptyGoal()),
  );
  const [initial] = useState(() => JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const saved = useRef<GoalView | null>(null);
  const mounted = useRef(true);
  const dirty = JSON.stringify(form) !== initial;
  const { objective, refs } = options;
  const period = refs.planningPeriods.find(
    (item) => item.id === objective.current.data.planningPeriodId,
  );
  const checks = smartReadiness(form, objective.current.data, refs);
  const readyCount = checks.filter((item) => item.ready).length;
  const owner = refs.employees.find((item) => item.id === form.ownerId);
  const backHref = `${routes.register}?saved=${encodeURIComponent(objective.id)}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () =>
      registerLeaveGuard(() => {
        if (saved.current) return true;
        if (submitting.current) return false;
        return !dirty || window.confirm("Discard your unsaved goal changes?");
      }),
    [dirty, registerLeaveGuard],
  );
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function update<K extends keyof GoalData>(key: K, value: GoalData[K]) {
    setForm((current) => editGoalDraft({ [key]: value }, current));
  }
  function toggleDepartment(id: string) {
    setForm((current) =>
      editGoalDraft(
        {
          contributingDepartmentIds: current.contributingDepartmentIds.includes(
            id,
          )
            ? current.contributingDepartmentIds.filter((item) => item !== id)
            : [...current.contributingDepartmentIds, id],
        },
        current,
      ),
    );
  }
  function cancel() {
    if (confirmLeave()) router.push(backHref);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const existing = saved.current ?? options.goal;
      const record = await service.saveGoal(
        objective.id,
        form,
        existing?.id,
        existing?.current.number,
      );
      saved.current = record;
      if (!mounted.current) return;
      toast(
        options.goal
          ? "Goal draft saved successfully."
          : "Goal draft created successfully.",
        "success",
      );
      router.replace(`${backHref}&savedGoal=${encodeURIComponent(record.id)}`);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The goal could not be saved. Your entries are still here; please try again.",
      );
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost"
        type="button"
        onClick={cancel}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-success focus-visible:outline-2 focus-visible:outline-success disabled:opacity-60 h-auto whitespace-normal"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to register
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {options.goal ? "Edit Goal Draft" : "Add Goal"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Define a measurable achievement that supports this objective.
          </p>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Draft
        </span>
      </div>

      <section
        className="rounded-xl border border-success/20 bg-success-subtle p-5"
        aria-labelledby="goal-objective-label"
      >
        <h3
          id="goal-objective-label"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success"
        >
          <Link2 size={15} aria-hidden="true" />
          Linked objective
        </h3>
        <p className="mt-2 break-words font-semibold">
          {objective.current.data.title || "Untitled objective"}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {objective.current.data.meaning ||
            "The objective's intended outcome has not been added yet."}
        </p>
        <p className="mt-2 text-xs leading-6 text-success">
          <span className="font-mono">{objective.code}</span> ·{" "}
          {objective.current.status} ·{" "}
          {period?.name ?? "Planning period not selected"}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          This link stays fixed.{" "}
          {objective.current.status !== "Approved"
            ? "The objective must be completed and approved before its goals can be approved."
            : "New goals remain drafts until separately approved."}
        </p>
        {objective.goals.length >= 2 && !options.goal && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            This objective already has {objective.goals.length} goals. One or
            two focused goals is usually enough; add another when it serves a
            distinct result.
          </p>
        )}
      </section>

      <form
        onSubmit={(event) => void save(event)}
        noValidate
        aria-label="Goal draft form"
      >
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <section className={panel} aria-labelledby="goal-result-heading">
            <h3
              id="goal-result-heading"
              className="flex items-center gap-2 font-semibold"
            >
              <Target size={18} className="text-success" aria-hidden="true" />
              Result & measurement
            </h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <label htmlFor="goal-result" className="text-sm font-medium">
                  Result statement
                </label>
                <Textarea
                  id="goal-result"
                  className={`${input} min-h-24 resize-y`}
                  value={form.resultStatement}
                  onChange={(event) =>
                    update("resultStatement", event.target.value)
                  }
                  placeholder="e.g. Reduce the production scrap rate to 2% by year end"
                  rows={3}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="goal-code" className="text-sm font-medium">
                  Goal code{" "}
                  <LockKeyhole
                    size={12}
                    className="ml-1 inline"
                    aria-hidden="true"
                  />
                </label>
                <Input
                  id="goal-code"
                  className={`${input} bg-muted font-mono text-xs`}
                  readOnly
                  value={options.goal?.code ?? "Assigned on save"}
                  aria-describedby="goal-code-help"
                />
                <p
                  id="goal-code-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  Auto-generated draft code. The final pillar/year code is
                  assigned on approval.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="goal-measure" className="text-sm font-medium">
                  Measure
                </label>
                <Textarea
                  id="goal-measure"
                  className={`${input} resize-y`}
                  value={form.measure}
                  onChange={(event) => update("measure", event.target.value)}
                  placeholder="e.g. Verified scrap weight ÷ total production weight × 100"
                  rows={2}
                  aria-describedby="goal-measure-help"
                />
                <p
                  id="goal-measure-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  Describe how this company result will be verified. Department
                  contributions do not replace its own measure.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <div className="min-w-0">
                <label htmlFor="goal-baseline" className="text-sm font-medium">
                  Baseline{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="goal-baseline"
                  className={input}
                  type="number"
                  step="any"
                  value={form.baseline ?? ""}
                  onChange={(event) =>
                    update(
                      "baseline",
                      event.target.value === ""
                        ? null
                        : event.target.valueAsNumber,
                    )
                  }
                  placeholder="e.g. 5"
                  aria-describedby="goal-baseline-help"
                />
                <p
                  id="goal-baseline-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  Leave blank if unknown. Missing data is not zero.
                </p>
              </div>
              <div className="min-w-0">
                <label htmlFor="goal-target" className="text-sm font-medium">
                  Target
                </label>
                <Input
                  id="goal-target"
                  className={input}
                  type="number"
                  step="any"
                  value={form.target ?? ""}
                  onChange={(event) =>
                    update(
                      "target",
                      event.target.value === ""
                        ? null
                        : event.target.valueAsNumber,
                    )
                  }
                  placeholder="e.g. 2"
                  aria-describedby="goal-target-help"
                />
                <p
                  id="goal-target-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  Zero is a valid target.
                </p>
              </div>
              <div className="min-w-0">
                <label htmlFor="goal-unit" className="text-sm font-medium">
                  Unit
                </label>
                <Input
                  id="goal-unit"
                  className={input}
                  value={form.unit}
                  onChange={(event) => update("unit", event.target.value)}
                  placeholder="e.g. %, days, units, KES"
                />
              </div>
            </div>
          </section>

          <section className={panel} aria-labelledby="goal-ownership-heading">
            <h3 id="goal-ownership-heading" className="font-semibold">
              Ownership & contributions
            </h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="goal-owner" className="text-sm font-medium">
                  Goal owner
                </label>
                <NativeSelect
                  id="goal-owner"
                  className={input}
                  value={form.ownerId ?? ""}
                  onChange={(event) =>
                    update("ownerId", event.target.value || null)
                  }
                >
                  <option value="">Select an owner</option>
                  {form.ownerId && !owner && (
                    <option value={form.ownerId}>
                      Saved owner — unavailable
                    </option>
                  )}
                  {refs.departments.map((department) => (
                    <optgroup key={department.id} label={department.name}>
                      {refs.employees
                        .filter(
                          (employee) => employee.departmentId === department.id,
                        )
                        .map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} — {employee.position}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </div>
              <div className="min-w-0">
                <label htmlFor="goal-deadline" className="text-sm font-medium">
                  Deadline
                </label>
                <Input
                  id="goal-deadline"
                  className={input}
                  type="date"
                  value={form.deadline}
                  onChange={(event) => update("deadline", event.target.value)}
                  aria-describedby="goal-deadline-help"
                />
                <p
                  id="goal-deadline-help"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  {period
                    ? `For approval, choose a date from ${period.startDate} to ${period.endDate}.`
                    : "Choose the objective's planning period before checking the deadline for approval."}
                </p>
              </div>
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-medium">
                Contributing departments
              </legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Select departments that will contribute to this goal. Each will
                reference this same company goal.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {refs.departments.map((department) => (
                  <label
                    key={department.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-3 text-sm ${form.contributingDepartmentIds.includes(department.id) ? "border-success/50 bg-success-subtle text-success" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    <Checkbox
                      className="mt-0.5 shrink-0"
                      checked={form.contributingDepartmentIds.includes(
                        department.id,
                      )}
                      onCheckedChange={() => toggleDepartment(department.id)}
                    />
                    {department.name}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {form.contributingDepartmentIds.length} selected · At least one
                is needed for approval.
              </p>
            </fieldset>
          </section>

          <section className={panel} aria-labelledby="goal-smart-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="goal-smart-heading" className="font-semibold">
                SMART readiness
              </h3>
              <p
                role="status"
                className={`rounded-full px-3 py-1 text-xs font-medium ${readyCount === 5 ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"}`}
              >
                {readyCount} of 5 SMART checks ready
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Readiness helps prepare the goal; it does not approve it. Drafts
              can be incomplete.
            </p>
            <ul className="mt-4 space-y-3">
              {checks.map((check) => (
                <li
                  key={check.dimension}
                  className="flex items-start gap-2.5 text-sm"
                >
                  {check.ready ? (
                    <CheckCircle2
                      size={18}
                      className="mt-0.5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      size={18}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <span className="font-medium">{check.dimension}</span>
                    <span
                      className={`ml-2 text-xs ${check.ready ? "text-success" : "text-muted-foreground"}`}
                    >
                      {check.ready ? "Ready" : "Needs attention"}
                    </span>
                    {!check.ready && (
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {check.message}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="text-sm font-medium">
                Leadership confirmations
              </legend>
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                Changing the result, measure, numbers, owner, deadline or
                departments clears these confirmations so they can be reviewed
                again.
              </p>
              <div className="space-y-3">
                {(
                  [
                    [
                      "specific",
                      "The result describes a specific achievement.",
                    ],
                    [
                      "achievable",
                      "The target is achievable with the available resources.",
                    ],
                    [
                      "relevant",
                      "This goal contributes to the linked objective.",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-start gap-2.5 text-sm leading-6 text-foreground"
                  >
                    <Checkbox
                      checked={form.smartConfirmations[key]}
                      onCheckedChange={(checked) => update("smartConfirmations", {
                          ...form.smartConfirmations,
                          [key]: checked,
                        })
                      }
                      className="mt-1 shrink-0"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <details className="mt-5 border-t border-border pt-4">
              <summary className="w-fit cursor-pointer rounded text-sm font-medium text-success focus-visible:outline-2 focus-visible:outline-success">
                SMART explanations (optional)
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Add context if useful. All five explanations can be left blank.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {checks.map(({ dimension }) => (
                  <div key={dimension} className="min-w-0">
                    <label
                      htmlFor={`goal-explanation-${dimension}`}
                      className="text-sm font-medium"
                    >
                      {dimension} explanation
                    </label>
                    <Textarea
                      id={`goal-explanation-${dimension}`}
                      className={`${input} resize-y`}
                      rows={2}
                      value={form.smartExplanations[dimension] ?? ""}
                      onChange={(event) =>
                        update("smartExplanations", {
                          ...form.smartExplanations,
                          [dimension]: event.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </details>
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <p className="flex max-w-md items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Save an incomplete draft and return later. Employees see this goal
              only after approval.
            </p>
            <div className="flex w-full gap-3 sm:w-auto">
              <Button variant="ghost"
                type="button"
                className={`h-auto whitespace-normal ${secondary} flex-1 sm:flex-none`}
                onClick={cancel}
              >
                Cancel
              </Button>
              <Button variant="ghost"
                type="submit"
                className={`h-auto whitespace-normal ${primary} flex-1 sm:flex-none`}
                aria-busy={saving}
              >
                {saving ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {saving ? "Saving…" : "Save Draft"}
              </Button>
            </div>
          </footer>
        </fieldset>
      </form>
    </div>
  );
}
