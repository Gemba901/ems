"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Info,
  Loader2,
  LockKeyhole,
  Save,
  Target,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import type {
  Alignment,
  Department,
  Employee,
  ObjectiveData,
  ObjectiveView,
  Pillar,
  PlanningPeriod,
} from "@/services/strategic-objectives";
import {
  ALIGNMENTS,
  emptyObjective,
} from "@/services/strategic-objectives/rules";
import { STRATEGIC_OBJECTIVES_ROUTES as routes } from "@/services/strategic-objectives/routes";
import { useStrategicObjectives } from "./StrategicObjectivesShell";

const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const inputClass =
  "mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-60";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-60";

type FormOptions = {
  pillars: Pillar[];
  employees: Employee[];
  departments: Department[];
  periods: PlanningPeriod[];
  objective: ObjectiveView | null;
};

export function ObjectiveForm({ objectiveId }: { objectiveId?: string }) {
  const { service, session } = useStrategicObjectives();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session?.canEdit) return;
    let active = true;
    Promise.all([
      service.getPillars(),
      service.getEmployees(),
      service.getDepartments(),
      service.getPlanningPeriods(),
      objectiveId ? service.getObjectives() : Promise.resolve([]),
    ])
      .then(([pillars, employees, departments, periods, objectives]) => {
        if (!active) return;
        const objective =
          objectives.find((item) => item.id === objectiveId) ?? null;
        if (objectiveId && !objective) {
          setError(
            "This objective is not available in this demo session. A page reload resets the sample plan.",
          );
          return;
        }
        setOptions({ pillars, employees, departments, periods, objective });
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the objective form.",
          );
      });
    return () => {
      active = false;
    };
  }, [service, session?.canEdit, objectiveId, attempt]);

  if (!session?.canEdit)
    return (
      <section className={`${panel} max-w-2xl`}>
        <LockKeyhole className="mb-4 text-slate-500" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">Leadership access required</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Only CEO / Authorised Leadership can create or edit objective drafts.
          Your current demo role can read the records available in the register.
        </p>
        <Link href={routes.register} className={`${secondaryButton} mt-5`}>
          Open register
        </Link>
      </section>
    );
  if (error)
    return (
      <section className={panel}>
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
          <Link href={routes.register} className={secondaryButton}>
            Open register
          </Link>
        </div>
      </section>
    );
  if (!options)
    return (
      <p
        role="status"
        className="flex items-center gap-2 py-10 text-sm text-slate-500"
      >
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        Loading objective fields…
      </p>
    );
  if (options.objective && options.objective.current.status !== "Draft")
    return (
      <section className={`${panel} max-w-2xl`}>
        <LockKeyhole className="mb-4 text-slate-500" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">
          {options.objective.current.status === "Approved"
            ? "Approved objective is locked"
            : "This objective has a pending revision"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This form edits drafts only. Approval and revision workflows will be
          added in a later step.
        </p>
        <Link href={routes.register} className={`${secondaryButton} mt-5`}>
          Open register
        </Link>
      </section>
    );
  return <ObjectiveDraftForm options={options} />;
}

function ObjectiveDraftForm({ options }: { options: FormOptions }) {
  const { service, registerLeaveGuard, confirmLeave } =
    useStrategicObjectives();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<ObjectiveData>(() =>
    structuredClone(options.objective?.current.data ?? emptyObjective()),
  );
  const [initial] = useState(() => JSON.stringify(form));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const saved = useRef<ObjectiveView | null>(null);
  const mounted = useRef(true);
  const dirty = JSON.stringify(form) !== initial;
  const selectedPillar = options.pillars.find(
    (item) => item.code === form.primaryPillarCode,
  );
  const selectedPeriod = options.periods.find(
    (item) => item.id === form.planningPeriodId,
  );
  const selectedOwner = options.employees.find(
    (item) => item.id === form.ownerId,
  );

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
        return (
          !dirty || window.confirm("Discard your unsaved objective changes?")
        );
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

  function update<K extends keyof ObjectiveData>(
    key: K,
    value: ObjectiveData[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function toggleAlignment(alignment: Alignment) {
    update(
      "alignments",
      form.alignments.includes(alignment)
        ? form.alignments.filter((item) => item !== alignment)
        : [...form.alignments, alignment],
    );
  }
  function cancel() {
    if (confirmLeave()) router.push(routes.register);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const existing = saved.current ?? options.objective;
      const record = existing
        ? await service.saveObjective(
            existing.id,
            form,
            existing.current.number,
          )
        : await service.createObjective(form);
      saved.current = record;
      if (!mounted.current) return;
      toast(
        options.objective
          ? "Objective draft saved successfully."
          : "Objective draft created successfully.",
        "success",
      );
      router.replace(
        `${routes.register}?saved=${encodeURIComponent(record.id)}`,
      );
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The draft could not be saved. Your entries are still here; please try again.",
      );
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded text-sm text-slate-600 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to register
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {options.objective ? "Edit Objective Draft" : "Create Objective"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Describe a clear direction for the company. You can save now and
            complete the details later.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          Draft
        </span>
      </div>
      <form
        onSubmit={(event) => void save(event)}
        noValidate
        aria-label="Objective draft form"
      >
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <section
            className={panel}
            aria-labelledby="objective-direction-heading"
          >
            <h3
              id="objective-direction-heading"
              className="flex items-center gap-2 font-semibold"
            >
              <Target size={18} className="text-teal-700" aria-hidden="true" />
              Objective direction
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              An objective describes an outcome. Measurable targets belong to
              its linked goals.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <label
                  htmlFor="objective-title"
                  className="text-sm font-medium"
                >
                  Objective title
                </label>
                <input
                  id="objective-title"
                  className={inputClass}
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  placeholder="e.g. Make production reliable and right first time"
                  autoComplete="off"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="objective-code" className="text-sm font-medium">
                  Objective code{" "}
                  <LockKeyhole
                    size={12}
                    className="ml-1 inline"
                    aria-hidden="true"
                  />
                </label>
                <input
                  id="objective-code"
                  className={`${inputClass} bg-slate-50 font-mono text-xs`}
                  readOnly
                  value={options.objective?.code ?? "Assigned on save"}
                  aria-describedby="objective-code-help"
                />
                <p
                  id="objective-code-help"
                  className="mt-2 text-xs leading-5 text-slate-500"
                >
                  Auto-generated draft code. The final pillar/year code is
                  assigned on approval.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="objective-meaning"
                  className="text-sm font-medium"
                >
                  Meaning / intended outcome
                </label>
                <textarea
                  id="objective-meaning"
                  className={`${inputClass} min-h-32 resize-y`}
                  rows={4}
                  value={form.meaning}
                  onChange={(event) => update("meaning", event.target.value)}
                  placeholder="Explain what this objective means and why it matters to the company."
                  aria-describedby="objective-meaning-help"
                />
                <p
                  id="objective-meaning-help"
                  className="mt-2 text-xs leading-5 text-slate-500"
                >
                  Use clear language. Objectives do not require SMART
                  explanations or a numeric target.
                </p>
              </div>
            </div>
          </section>

          <section
            className={panel}
            aria-labelledby="objective-alignment-heading"
          >
            <h3 id="objective-alignment-heading" className="font-semibold">
              Pillar & alignment
            </h3>
            <div className="mt-5">
              <label htmlFor="objective-pillar" className="text-sm font-medium">
                Primary BEES pillar
              </label>
              <select
                id="objective-pillar"
                className={inputClass}
                value={form.primaryPillarCode ?? ""}
                onChange={(event) =>
                  update(
                    "primaryPillarCode",
                    options.pillars.find(
                      (item) => item.code === event.target.value,
                    )?.code ?? null,
                  )
                }
                aria-describedby="objective-pillar-help"
              >
                <option value="">Select one pillar</option>
                {options.pillars.map((pillar) => (
                  <option key={pillar.code} value={pillar.code}>
                    {pillar.code} — {pillar.name}
                  </option>
                ))}
              </select>
              <p
                id="objective-pillar-help"
                className="mt-2 text-xs leading-5 text-slate-500"
              >
                {selectedPillar?.description ??
                  "Choose one of the six shared BEES pillars. You do not need an objective for every pillar."}
              </p>
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-medium">QCDSMT alignment</legend>
              <p className="mt-1 text-xs text-slate-500">
                Choose the dimensions this objective supports.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALIGNMENTS.map((alignment) => (
                  <label
                    key={alignment}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-3 text-sm ${form.alignments.includes(alignment) ? "border-teal-300 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={form.alignments.includes(alignment)}
                      onChange={() => toggleAlignment(alignment)}
                      className="h-4 w-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                    />
                    {alignment}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section
            className={panel}
            aria-labelledby="objective-responsibility-heading"
          >
            <h3 id="objective-responsibility-heading" className="font-semibold">
              Ownership & planning period
            </h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label
                  htmlFor="objective-owner"
                  className="text-sm font-medium"
                >
                  Objective owner
                </label>
                <select
                  id="objective-owner"
                  className={inputClass}
                  value={form.ownerId ?? ""}
                  onChange={(event) =>
                    update("ownerId", event.target.value || null)
                  }
                  aria-describedby="objective-owner-help"
                >
                  <option value="">Select an owner</option>
                  {form.ownerId && !selectedOwner && (
                    <option value={form.ownerId}>
                      Saved owner — unavailable
                    </option>
                  )}
                  {options.departments.map((department) => (
                    <optgroup key={department.id} label={department.name}>
                      {options.employees
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
                </select>
                <p
                  id="objective-owner-help"
                  className="mt-2 text-xs leading-5 text-slate-500"
                >
                  {selectedOwner
                    ? `${selectedOwner.position} · ${options.departments.find((item) => item.id === selectedOwner.departmentId)?.name ?? "Department not available"}`
                    : "Choose the person accountable for this objective."}
                </p>
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="objective-period"
                  className="text-sm font-medium"
                >
                  Planning period
                </label>
                <select
                  id="objective-period"
                  className={inputClass}
                  value={form.planningPeriodId ?? ""}
                  onChange={(event) =>
                    update("planningPeriodId", event.target.value || null)
                  }
                  aria-describedby="objective-period-help"
                >
                  <option value="">Select a planning period</option>
                  {form.planningPeriodId && !selectedPeriod && (
                    <option value={form.planningPeriodId}>
                      Saved period — unavailable
                    </option>
                  )}
                  {options.periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
                <p
                  id="objective-period-help"
                  className="mt-2 text-xs leading-5 text-slate-500"
                >
                  {selectedPeriod
                    ? `${selectedPeriod.startDate} to ${selectedPeriod.endDate}`
                    : "Use a shared performance year or planning period."}
                </p>
              </div>
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <p className="flex max-w-md items-start gap-2 text-xs leading-5 text-slate-500">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Every field can be left incomplete when saving a draft. Nothing is
              approved or shared with employees yet.
            </p>
            <div className="flex w-full gap-3 sm:w-auto">
              <button
                type="button"
                className={`${secondaryButton} flex-1 sm:flex-none`}
                onClick={cancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${primaryButton} flex-1 sm:flex-none`}
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
              </button>
            </div>
          </footer>
        </fieldset>
      </form>
    </div>
  );
}
