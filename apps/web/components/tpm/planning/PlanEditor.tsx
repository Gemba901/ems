"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock3,
  Factory,
  FileCheck2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { useAssets } from "../AssetsProvider";
import { useInspections } from "../inspections/InspectionsProvider";
import { useAssetOperators } from "../useAssetOperators";
import { WorkOrderAssetPicker } from "../work-orders/WorkOrderAssetPicker";
import { WORK_ORDER_PRIORITIES } from "../work-orders/work-order-types";
import { useMaintenancePlans } from "./MaintenancePlansProvider";
import {
  emptyPlan,
  PLAN_FREQUENCIES,
  previewPlanDates,
  validatePlanInput,
  type MaintenancePlan,
  type PlanInput,
} from "./planning-preview";
import "../work-orders/work-order-list-form.css";
import "./planning-editor.css";

const STEPS = [
  "Basic Info",
  "Tasks & Checklist",
  "Schedule",
  "Assignment & Resources",
  "Exceptions & Notes",
  "Review",
];
const STEP_FIELDS = [
  ["name", "kind", "assetIds", "priority"],
  ["checklistId", "tasks"],
  ["frequency", "startDate", "endDate", "dueTime", "dueWindowDays", "timeZone"],
  ["assigneeId", "assigneeName", "team", "estimatedMinutes", "manpower"],
  ["excludedWeekdays", "excludedDates", "notes"],
];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const errorText = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Could not save the maintenance plan. Please try again.";
const fieldStep = (field: string) =>
  Math.max(
    0,
    STEP_FIELDS.findIndex((keys) => keys.includes(field.split(".")[0])),
  );
const showNumber = (value: number) => (Number.isFinite(value) ? value : "");
const parseNumber = (value: string) =>
  value === "" ? Number.NaN : Number(value);

export function PlanEditor({ id }: { id?: string }) {
  const planning = useMaintenancePlans();
  const assets = useAssets();
  const inspections = useInspections();
  const scope = useAuthStore(
    (state) =>
      `${state.user?.organizationId ?? "none"}:${state.user?.userId ?? "none"}`,
  );
  if (planning.loading || assets.loading || inspections.loading)
    return (
      <div className="wo-empty" role="status">
        Loading maintenance plan…
      </div>
    );
  const error = planning.error || assets.error || inspections.error;
  if (error)
    return (
      <div className="wo-empty">
        <h2>Could not load the plan</h2>
        <p role="alert">{error}</p>
        <button
          type="button"
          className="tpm-button"
          onClick={() => {
            planning.retry();
            assets.retry();
            inspections.retry();
          }}
        >
          Try again
        </button>
      </div>
    );
  const plan = id ? planning.plans.find((entry) => entry.id === id) : undefined;
  if (id && !plan)
    return (
      <div className="wo-empty">
        <h2>Maintenance plan not found</h2>
        <Link href="/tpm/planning" className="tpm-button">
          Back to planning
        </Link>
      </div>
    );
  if (plan?.status === "Archived")
    return (
      <div className="wo-empty">
        <h2>This plan is archived</h2>
        <p>Archived plans retain their scheduled job history.</p>
        <Link href={`/tpm/planning/${plan.id}`} className="tpm-button">
          View plan
        </Link>
      </div>
    );
  return <PlanForm key={`${scope}:${id ?? "new"}`} plan={plan} />;
}

function PlanForm({ plan }: { plan?: MaintenancePlan }) {
  const { assets } = useAssets();
  const { checklists } = useInspections();
  const { savePlan } = useMaintenancePlans();
  const operators = useAssetOperators();
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<PlanInput>(() =>
    structuredClone(
      plan ?? emptyPlan(user?.organizationTimeZone || "Asia/Kolkata"),
    ),
  );
  const [activeStep, setActiveStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [baseRevision] = useState(plan?.updatedAt);
  const [holidayText, setHolidayText] = useState(() =>
    form.excludedDates.join("\n"),
  );
  const [pmTasks, setPmTasks] = useState<PlanInput["tasks"]>(() =>
    form.kind === "PM" ? form.tasks : [],
  );
  const root = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const stale = !!plan && plan.updatedAt !== baseRevision;
  const selectedChecklist = checklists.find(
    (entry) => entry.id === form.checklistId,
  );
  const availableChecklists = checklists.filter(
    (entry) => entry.status === "Published" && entry.kind === form.kind,
  );
  const selectedAssets = form.assetIds.map(
    (assetId) =>
      assets.find((asset) => asset.id === assetId) ??
      plan?.assetSnapshots.find((asset) => asset.id === assetId) ?? {
        id: assetId,
        name: "Unavailable asset",
        code: assetId,
      },
  );
  const missingAssignee =
    form.assigneeId &&
    !operators.members.some((member) => member.id === form.assigneeId);
  const finalLabel =
    !plan || plan.status === "Draft" ? "Activate plan" : "Save changes";

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  useEffect(() => {
    const container = nav.current;
    if (!container) return;
    const keepVisible = () => {
      const button = container.querySelector<HTMLElement>(
        '[aria-current="step"]',
      );
      if (!button) return;
      const bounds = container.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      if (target.left >= bounds.left && target.right <= bounds.right) return;
      container.scrollTo({
        left:
          container.scrollLeft +
          target.left -
          bounds.left -
          (container.clientWidth - target.width) / 2,
        behavior: "instant",
      });
    };
    keepVisible();
    const observer = new ResizeObserver(keepVisible);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeStep]);

  function update<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([field]) => field !== key && !field.startsWith(`${key}.`),
        ),
      ),
    );
    setSaveError("");
    setDirty(true);
  }
  function issue(field: string) {
    return Object.entries(errors).find(
      ([key]) => key === field || key.startsWith(`${field}.`),
    )?.[1];
  }
  function error(field: string) {
    return issue(field) ? (
      <p className="wo-form-error" id={`pm-error-${field}`} role="alert">
        {issue(field)}
      </p>
    ) : null;
  }
  function validate(draft = false, beforeStep = 5) {
    if (stale) {
      setSaveError(
        "This plan changed while you were editing. Return to the plan and reopen Edit plan to use its latest version.",
      );
      return false;
    }
    const all = validatePlanInput(form, draft);
    if (!draft) {
      if (
        form.assetIds.some(
          (assetId) =>
            !assets.some(
              (asset) =>
                asset.id === assetId &&
                asset.stage === "Registered" &&
                asset.usage !== "Retired",
            ),
        )
      )
        all.assetIds = "Select registered assets that have not been retired.";
      if (
        form.checklistId &&
        (!selectedChecklist ||
          selectedChecklist.status !== "Published" ||
          selectedChecklist.kind !== form.kind)
      )
        all.checklistId = `Choose a published ${form.kind} checklist.`;
    }
    const visible = Object.fromEntries(
      Object.entries(all).filter(([field]) => fieldStep(field) < beforeStep),
    );
    setErrors(visible);
    if (!Object.keys(visible).length) return true;
    setActiveStep(Math.min(...Object.keys(visible).map(fieldStep)));
    requestAnimationFrame(() => {
      const control = root.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      control?.focus();
      control?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return false;
  }
  function navigate(step: number) {
    if (saving || step < 0 || step > 5 || step === activeStep) return;
    if (step > activeStep && !validate(false, step)) return;
    setActiveStep(step);
    setSaveError("");
    requestAnimationFrame(() => {
      root.current
        ?.querySelector<HTMLElement>("[data-step-heading]")
        ?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function cancel() {
    if (
      dirty &&
      !window.confirm("Discard your unsaved maintenance plan changes?")
    )
      return;
    router.push(plan ? `/tpm/planning/${plan.id}` : "/tpm/planning");
  }
  function persist(draft: boolean) {
    if (savingRef.current || !validate(draft)) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const saved = savePlan(
        form,
        plan?.id,
        !draft && (!plan || plan.status === "Draft"),
        baseRevision,
      );
      setDirty(false);
      toast(
        draft
          ? "Maintenance plan draft saved"
          : plan && plan.status !== "Draft"
            ? "Maintenance plan updated successfully"
            : "Maintenance plan activated successfully",
        "success",
      );
      router.push(`/tpm/planning/${saved.id}`);
    } catch (cause) {
      setSaveError(errorText(cause));
      savingRef.current = false;
      setSaving(false);
    }
  }
  function field(
    fieldName: keyof PlanInput,
    label: string,
    children: ReactNode,
    wide = false,
  ) {
    return (
      <div className={`wo-field${wide ? " wo-field-wide" : ""}`}>
        <label htmlFor={`pm-${fieldName}`}>{label}</label>
        {children}
        {error(fieldName)}
      </div>
    );
  }
  function section(
    title: string,
    description: string,
    icon: ReactNode,
    children: ReactNode,
  ) {
    return (
      <section className="wo-form-section">
        <div className="wo-section-heading">
          <span>{icon}</span>
          <div>
            <h2 data-step-heading tabIndex={-1}>
              {title}
            </h2>
            <p>{description}</p>
          </div>
        </div>
        <div className="wo-form-fields">{children}</div>
      </section>
    );
  }

  return (
    <div className="pm-editor" ref={root}>
      <button
        type="button"
        className="wo-back-link wo-back-button"
        onClick={cancel}
      >
        <ArrowLeft size={16} />
        {plan ? "Plan details" : "PM planning"}
      </button>
      <header className="wo-page-heading">
        <div>
          <h1>
            {plan
              ? plan.status === "Draft"
                ? "Edit maintenance draft"
                : "Edit maintenance plan"
              : "New maintenance plan"}
          </h1>
          <p>
            Plan repeatable maintenance, assign responsibility, and keep every
            scheduled job traceable.
          </p>
        </div>
        <span className="wo-required-note">* Required to activate</span>
      </header>
      <nav
        className="pm-editor-stepper"
        aria-label="Maintenance plan steps"
        ref={nav}
      >
        <ol>
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={
                index === activeStep
                  ? "is-active"
                  : index < activeStep
                    ? "is-complete"
                    : ""
              }
            >
              <button
                type="button"
                aria-label={`Step ${index + 1}: ${step}`}
                aria-current={activeStep === index ? "step" : undefined}
                disabled={saving}
                onClick={() => navigate(index)}
              >
                <span className="pm-editor-step-circle" aria-hidden="true">
                  {index < activeStep ? <Check size={18} /> : index + 1}
                </span>
                <span>{step}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {stale && (
        <p className="wo-save-error" role="alert">
          This plan has changed in another tab. Reopen it before saving your
          changes.
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (activeStep < 5) navigate(activeStep + 1);
          else persist(false);
        }}
      >
        <fieldset className="wo-form-fieldset" disabled={saving}>
          {activeStep === 0 &&
            section(
              "Basic info",
              "Choose what to maintain and how the work will be carried out.",
              <Factory size={20} />,
              <>
                {field(
                  "name",
                  "Plan name *",
                  <input
                    id="pm-name"
                    value={form.name}
                    maxLength={200}
                    aria-invalid={!!issue("name")}
                    placeholder="e.g. Weekly filling machine maintenance"
                    onChange={(event) => update("name", event.target.value)}
                  />,
                  true,
                )}
                {field(
                  "kind",
                  "Maintenance type *",
                  <select
                    id="pm-kind"
                    value={form.kind}
                    onChange={(event) => {
                      const kind = event.target.value as PlanInput["kind"];
                      if (form.kind === "PM") setPmTasks(form.tasks);
                      update("kind", kind);
                      update("checklistId", "");
                      update("tasks", kind === "PM" ? pmTasks : []);
                    }}
                  >
                    <option value="AM">AM · Autonomous maintenance</option>
                    <option value="PM">PM · Preventive maintenance</option>
                  </select>,
                )}
                {field(
                  "priority",
                  "Priority",
                  <select
                    id="pm-priority"
                    value={form.priority}
                    onChange={(event) =>
                      update(
                        "priority",
                        event.target.value as PlanInput["priority"],
                      )
                    }
                  >
                    {WORK_ORDER_PRIORITIES.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>,
                )}
                <div className="pm-editor-hint wo-field-wide">
                  <ClipboardCheck size={18} />
                  <p>
                    {form.kind === "AM"
                      ? "AM jobs open an inspection using your published checklist. The operator records the checks for each scheduled visit."
                      : "PM jobs create a preventive work order with the tasks and assignments you define in this plan."}
                  </p>
                </div>
                <div
                  className="wo-field-wide pm-editor-assets"
                  tabIndex={-1}
                  aria-invalid={!!issue("assetIds")}
                >
                  <div className="wo-subheading">
                    <div>
                      <h3>
                        Selected assets{" "}
                        <span className="pm-editor-count">
                          {form.assetIds.length}
                        </span>
                      </h3>
                      <p>
                        Each asset receives its own scheduled job. Add up to 50
                        registered assets.
                      </p>
                    </div>
                  </div>
                  <WorkOrderAssetPicker
                    assets={assets}
                    value=""
                    disabled={form.assetIds.length >= 50}
                    onChange={(assetId) => {
                      if (!form.assetIds.includes(assetId))
                        update("assetIds", [...form.assetIds, assetId]);
                    }}
                  />
                  <div className="pm-editor-asset-list">
                    {selectedAssets.map((asset) => (
                      <div key={asset.id}>
                        <Factory size={17} />
                        <span>
                          <strong>{asset.name}</strong>
                          <small>{asset.code}</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove asset ${asset.name}`}
                          onClick={() =>
                            update(
                              "assetIds",
                              form.assetIds.filter(
                                (assetId) => assetId !== asset.id,
                              ),
                            )
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {error("assetIds")}
                </div>
              </>,
            )}
          {activeStep === 1 &&
            section(
              "Tasks & checklist",
              form.kind === "AM"
                ? "Choose the checks your operator will perform."
                : "Define the work to repeat at every planned visit.",
              <ClipboardCheck size={20} />,
              <>
                {field(
                  "checklistId",
                  form.kind === "AM"
                    ? "AM inspection checklist *"
                    : "PM inspection checklist (optional)",
                  <select
                    id="pm-checklistId"
                    value={form.checklistId}
                    aria-invalid={!!issue("checklistId")}
                    onChange={(event) =>
                      update("checklistId", event.target.value)
                    }
                  >
                    <option value="">
                      {form.kind === "AM"
                        ? "Choose a published AM checklist"
                        : "No checklist"}
                    </option>
                    {form.checklistId &&
                      !availableChecklists.some(
                        (entry) => entry.id === form.checklistId,
                      ) && (
                        <option value={form.checklistId}>
                          {selectedChecklist?.name || "Saved checklist"} ·
                          unavailable for new jobs
                        </option>
                      )}
                    {availableChecklists.map((checklist) => (
                      <option key={checklist.id} value={checklist.id}>
                        {checklist.name} · {checklist.items.length} checks
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {!availableChecklists.length && (
                  <p className="pm-editor-hint wo-field-wide">
                    No published {form.kind} checklists yet.{" "}
                    <Link
                      href="/tpm/inspections"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open inspection checklists
                    </Link>
                  </p>
                )}
                {selectedChecklist && (
                  <div className="pm-editor-checklist-preview wo-field-wide">
                    <strong>{selectedChecklist.name}</strong>
                    <span>
                      Version {selectedChecklist.version} ·{" "}
                      {selectedChecklist.items.length} checks
                    </span>
                    <ol>
                      {selectedChecklist.items.slice(0, 5).map((item) => (
                        <li key={item.id}>{item.title}</li>
                      ))}
                    </ol>
                    {selectedChecklist.items.length > 5 && (
                      <small>
                        + {selectedChecklist.items.length - 5} more checks
                      </small>
                    )}
                  </div>
                )}
                {form.kind === "PM" && (
                  <div
                    className="wo-field-wide wo-plan-group"
                    tabIndex={-1}
                    aria-invalid={!!issue("tasks")}
                  >
                    <div className="wo-subheading">
                      <div>
                        <h3>Work order tasks *</h3>
                        <p>
                          Every task gets its own Start/Stop timer during the
                          work.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="tpm-button"
                        disabled={form.tasks.length >= 50}
                        onClick={() =>
                          update("tasks", [
                            ...form.tasks,
                            {
                              id: crypto.randomUUID(),
                              title: "",
                              description: "",
                              estimatedHours: "",
                              required: true,
                            },
                          ])
                        }
                      >
                        <Plus size={15} />
                        Add task
                      </button>
                    </div>
                    {!form.tasks.length && (
                      <p className="wo-plan-empty">
                        Add at least one task, such as inspect drive components
                        or lubricate bearings.
                      </p>
                    )}
                    {form.tasks.map((task, index) => (
                      <div key={task.id} className="pm-editor-task">
                        <div className="pm-editor-task-top">
                          <strong>Task {index + 1}</strong>
                          <button
                            type="button"
                            className="wo-row-remove"
                            aria-label={`Remove task ${index + 1}`}
                            onClick={() =>
                              update(
                                "tasks",
                                form.tasks.filter(
                                  (entry) => entry.id !== task.id,
                                ),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="wo-form-fields">
                          <div className="wo-field">
                            <label htmlFor={`pm-task-title-${task.id}`}>
                              Task {index + 1} title *
                            </label>
                            <input
                              id={`pm-task-title-${task.id}`}
                              maxLength={300}
                              value={task.title}
                              onChange={(event) =>
                                update(
                                  "tasks",
                                  form.tasks.map((entry) =>
                                    entry.id === task.id
                                      ? { ...entry, title: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="wo-field">
                            <label htmlFor={`pm-task-hours-${task.id}`}>
                              Estimated hours (optional)
                            </label>
                            <input
                              id={`pm-task-hours-${task.id}`}
                              type="number"
                              min="0.01"
                              step="any"
                              value={task.estimatedHours}
                              onChange={(event) =>
                                update(
                                  "tasks",
                                  form.tasks.map((entry) =>
                                    entry.id === task.id
                                      ? {
                                          ...entry,
                                          estimatedHours: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div className="wo-field wo-field-wide">
                            <label htmlFor={`pm-task-notes-${task.id}`}>
                              Instructions
                            </label>
                            <textarea
                              id={`pm-task-notes-${task.id}`}
                              rows={2}
                              maxLength={2000}
                              value={task.description}
                              onChange={(event) =>
                                update(
                                  "tasks",
                                  form.tasks.map((entry) =>
                                    entry.id === task.id
                                      ? {
                                          ...entry,
                                          description: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {error("tasks")}
                  </div>
                )}
              </>,
            )}
          {activeStep === 2 &&
            section(
              "Schedule",
              "Set the calendar rhythm and completion window for each job.",
              <CalendarClock size={20} />,
              <>
                {field(
                  "frequency",
                  "Repeat frequency *",
                  <select
                    id="pm-frequency"
                    value={form.frequency}
                    onChange={(event) =>
                      update(
                        "frequency",
                        event.target.value as PlanInput["frequency"],
                      )
                    }
                  >
                    {PLAN_FREQUENCIES.map((frequency) => (
                      <option key={frequency}>{frequency}</option>
                    ))}
                  </select>,
                )}
                {field(
                  "timeZone",
                  "Organization time zone",
                  <input
                    id="pm-timeZone"
                    value={form.timeZone}
                    readOnly
                    aria-invalid={!!issue("timeZone")}
                  />,
                )}
                {field(
                  "startDate",
                  "First scheduled date *",
                  <input
                    id="pm-startDate"
                    type="date"
                    value={form.startDate}
                    aria-invalid={!!issue("startDate")}
                    onChange={(event) =>
                      update("startDate", event.target.value)
                    }
                  />,
                )}
                {field(
                  "endDate",
                  "End date (optional)",
                  <input
                    id="pm-endDate"
                    type="date"
                    min={form.startDate || undefined}
                    value={form.endDate}
                    aria-invalid={!!issue("endDate")}
                    onChange={(event) => update("endDate", event.target.value)}
                  />,
                )}
                {field(
                  "dueTime",
                  "Due time *",
                  <input
                    id="pm-dueTime"
                    type="time"
                    value={form.dueTime}
                    aria-invalid={!!issue("dueTime")}
                    onChange={(event) => update("dueTime", event.target.value)}
                  />,
                )}
                {field(
                  "dueWindowDays",
                  "Days allowed after scheduled date",
                  <input
                    id="pm-dueWindowDays"
                    type="number"
                    min="0"
                    max="30"
                    step="1"
                    value={showNumber(form.dueWindowDays)}
                    aria-invalid={!!issue("dueWindowDays")}
                    onChange={(event) =>
                      update("dueWindowDays", parseNumber(event.target.value))
                    }
                  />,
                )}
                <div className="pm-editor-hint wo-field-wide">
                  <Clock3 size={18} />
                  <p>
                    A value of 0 means the job is due on its scheduled date.
                    Completing a job late keeps future dates anchored to this
                    schedule. Monthly plans use the last available day in
                    shorter months.
                  </p>
                </div>
              </>,
            )}
          {activeStep === 3 &&
            section(
              "Assignment & resources",
              "Set the people and effort expected for each asset visit.",
              <Users size={20} />,
              <>
                {field(
                  "assigneeId",
                  "Assigned person (optional)",
                  <select
                    id="pm-assigneeId"
                    value={form.assigneeId}
                    disabled={
                      !operators.enabled ||
                      operators.loading ||
                      operators.failed
                    }
                    aria-invalid={
                      !!issue("assigneeId") || !!issue("assigneeName")
                    }
                    onChange={(event) => {
                      const member = operators.members.find(
                        (entry) => entry.id === event.target.value,
                      );
                      update("assigneeId", member?.id ?? "");
                      update("assigneeName", member?.name ?? "");
                    }}
                  >
                    <option value="">
                      {operators.loading
                        ? "Loading organization members…"
                        : "Unassigned"}
                    </option>
                    {missingAssignee && (
                      <option value={form.assigneeId}>
                        {form.assigneeName} · saved selection
                      </option>
                    )}
                    {operators.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "team",
                  "Maintenance team (optional)",
                  <input
                    id="pm-team"
                    value={form.team}
                    maxLength={200}
                    placeholder="e.g. Mechanical maintenance"
                    onChange={(event) => update("team", event.target.value)}
                  />,
                )}
                {error("assigneeName")}
                {(operators.failed || !operators.enabled) && (
                  <p className="wo-help wo-field-wide">
                    {operators.failed
                      ? "Organization members could not be loaded. You can leave this plan unassigned."
                      : "Member selection is not available for this account. You can leave this plan unassigned."}
                    {operators.failed && (
                      <button
                        type="button"
                        className="wo-text-button"
                        onClick={() => void operators.query.refetch()}
                      >
                        Retry members
                      </button>
                    )}
                  </p>
                )}
                {field(
                  "estimatedMinutes",
                  "Estimated task time per job (minutes) *",
                  <input
                    id="pm-estimatedMinutes"
                    type="number"
                    min="1"
                    max="525600"
                    step="1"
                    value={showNumber(form.estimatedMinutes)}
                    aria-invalid={!!issue("estimatedMinutes")}
                    onChange={(event) =>
                      update(
                        "estimatedMinutes",
                        parseNumber(event.target.value),
                      )
                    }
                  />,
                )}
                {field(
                  "manpower",
                  "People required per job *",
                  <input
                    id="pm-manpower"
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={showNumber(form.manpower)}
                    aria-invalid={!!issue("manpower")}
                    onChange={(event) =>
                      update("manpower", parseNumber(event.target.value))
                    }
                  />,
                )}
                <div className="pm-editor-hint wo-field-wide">
                  <Users size={18} />
                  <p>
                    These estimates are saved with each scheduled job. Actual
                    task time is recorded during execution; machine downtime is
                    tracked separately.
                  </p>
                </div>
              </>,
            )}
          {activeStep === 4 &&
            section(
              "Exceptions & notes",
              "Account for weekly days off, holidays and instructions for the team.",
              <ShieldCheck size={20} />,
              <>
                <fieldset
                  className="pm-editor-weekdays wo-field-wide"
                  tabIndex={-1}
                  aria-invalid={!!issue("excludedWeekdays")}
                >
                  <legend>Days off — exclude from maintenance</legend>
                  <div>
                    {WEEKDAYS.map((day, index) => (
                      <label
                        key={day}
                        className={
                          form.excludedWeekdays.includes(index)
                            ? "is-selected"
                            : ""
                        }
                      >
                        <input
                          type="checkbox"
                          checked={form.excludedWeekdays.includes(index)}
                          onChange={(event) =>
                            update(
                              "excludedWeekdays",
                              event.target.checked
                                ? [...form.excludedWeekdays, index].sort()
                                : form.excludedWeekdays.filter(
                                    (value) => value !== index,
                                  ),
                            )
                          }
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                  {error("excludedWeekdays")}
                </fieldset>
                {field(
                  "excludedDates",
                  "Holidays / excluded dates (optional)",
                  <textarea
                    id="pm-excludedDates"
                    rows={4}
                    value={holidayText}
                    aria-invalid={!!issue("excludedDates")}
                    placeholder={"YYYY-MM-DD\nOne date per line"}
                    onChange={(event) => {
                      setHolidayText(event.target.value);
                      update(
                        "excludedDates",
                        event.target.value
                          .split(/[\n,]+/)
                          .map((date) => date.trim())
                          .filter(Boolean),
                      );
                    }}
                  />,
                )}
                {field(
                  "notes",
                  "Plan notes (optional)",
                  <textarea
                    id="pm-notes"
                    rows={4}
                    maxLength={4000}
                    value={form.notes}
                    aria-invalid={!!issue("notes")}
                    placeholder="Shutdown precautions, preferred maintenance window, or other instructions…"
                    onChange={(event) => update("notes", event.target.value)}
                  />,
                )}
                <p className="wo-help wo-field-wide">
                  Excluded dates remain visible as skipped jobs when you
                  generate the schedule. They do not count as completed
                  maintenance.
                </p>
                <SchedulePreview input={form} />
              </>,
            )}
          {activeStep === 5 &&
            section(
              "Review maintenance plan",
              "Check the setup before activating the plan or saving your changes.",
              <FileCheck2 size={20} />,
              <>
                <div className="pm-editor-review-title wo-field-wide">
                  <span className="pm-editor-kind">
                    {form.kind} ·{" "}
                    {form.kind === "AM"
                      ? "Inspection jobs"
                      : "Preventive work orders"}
                  </span>
                  <h3>{form.name}</h3>
                  <p>
                    {selectedAssets.length}{" "}
                    {selectedAssets.length === 1 ? "asset" : "assets"} ·{" "}
                    {form.frequency} · {form.priority} priority
                  </p>
                </div>
                <dl className="pm-editor-review-grid wo-field-wide">
                  <ReviewItem
                    title="First scheduled date"
                    value={form.startDate}
                  />
                  <ReviewItem
                    title="End date"
                    value={form.endDate || "No end date"}
                  />
                  <ReviewItem
                    title="Due time"
                    value={`${form.dueTime} · ${form.timeZone}`}
                  />
                  <ReviewItem
                    title="Completion window"
                    value={
                      form.dueWindowDays === 0
                        ? "Scheduled day"
                        : `${form.dueWindowDays} days after scheduled date`
                    }
                  />
                  <ReviewItem
                    title="Assigned person"
                    value={form.assigneeName || "Unassigned"}
                  />
                  <ReviewItem
                    title="Maintenance team"
                    value={form.team || "Not set"}
                  />
                  <ReviewItem
                    title="Estimated task time per job"
                    value={`${form.estimatedMinutes} minutes`}
                  />
                  <ReviewItem
                    title="People required"
                    value={String(form.manpower)}
                  />
                  <ReviewItem
                    title="Checklist"
                    value={selectedChecklist?.name || "No checklist"}
                  />
                  <ReviewItem
                    title="Days off"
                    value={
                      form.excludedWeekdays
                        .map((day) => WEEKDAYS[day])
                        .join(", ") || "None"
                    }
                  />
                </dl>
                <div className="pm-editor-review-assets wo-field-wide">
                  <h3>Assets</h3>
                  {selectedAssets.map((asset) => (
                    <div key={asset.id}>
                      <Factory size={16} />
                      <span>
                        {asset.name}
                        <small>{asset.code}</small>
                      </span>
                    </div>
                  ))}
                </div>
                {form.kind === "PM" && (
                  <div className="pm-editor-review-tasks wo-field-wide">
                    <h3>Work tasks · {form.tasks.length}</h3>
                    <ol>
                      {form.tasks.map((task) => (
                        <li key={task.id}>
                          <strong>{task.title}</strong>
                          {task.estimatedHours && (
                            <span>{task.estimatedHours} hours estimated</span>
                          )}
                          {task.description && <p>{task.description}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {form.excludedDates.length > 0 && (
                  <div className="wo-field-wide pm-editor-review-notes">
                    <h3>Excluded dates</h3>
                    <p>{form.excludedDates.join(", ")}</p>
                  </div>
                )}
                {form.notes && (
                  <div className="wo-field-wide pm-editor-review-notes">
                    <h3>Plan notes</h3>
                    <p>{form.notes}</p>
                  </div>
                )}
                <SchedulePreview input={form} />
                <div className="pm-editor-hint wo-field-wide">
                  <CalendarClock size={18} />
                  <p>
                    {plan
                      ? "Plan changes apply to newly generated jobs. Existing scheduled jobs retain their original instructions and dates."
                      : "After activation, use Generate jobs to create the schedule for a chosen date range. Each asset and planned date gets one job."}
                  </p>
                </div>
              </>,
            )}
          {saveError && (
            <div className="wo-save-error" role="alert">
              {saveError}
            </div>
          )}
          <footer className="wo-editor-actions pm-editor-actions">
            <span>
              Step {activeStep + 1} of {STEPS.length} · {STEPS[activeStep]}
            </span>
            <button type="button" className="tpm-button" onClick={cancel}>
              Cancel
            </button>
            {(!plan || plan.status === "Draft") && (
              <button
                type="button"
                className="tpm-button"
                onClick={() => persist(true)}
                disabled={saving || stale}
              >
                <Save size={15} />
                Save draft
              </button>
            )}
            <button
              type="button"
              className="tpm-button"
              disabled={activeStep === 0 || saving}
              onClick={() => navigate(activeStep - 1)}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <button
              type="submit"
              className="tpm-button primary"
              disabled={saving || stale}
            >
              {activeStep === 5 ? <Check size={16} /> : null}
              {saving
                ? "Saving…"
                : activeStep === 5
                  ? finalLabel
                  : activeStep === 4
                    ? "Review plan"
                    : "Next"}
              {activeStep < 5 && <ArrowRight size={16} />}
            </button>
          </footer>
        </fieldset>
      </form>
    </div>
  );
}

function ReviewItem({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SchedulePreview({ input }: { input: PlanInput }) {
  const dates = useMemo(() => previewPlanDates(input), [input]);
  return (
    <div className="pm-editor-schedule-preview wo-field-wide">
      <div className="wo-subheading">
        <div>
          <h3>First scheduled dates</h3>
          <p>
            One job per asset on each date, with your days off marked below.
          </p>
        </div>
        <CalendarClock size={19} aria-hidden="true" />
      </div>
      {dates.length ? (
        <ol>
          {dates.map((entry) => (
            <li
              key={entry.date}
              className={entry.state === "Skipped" ? "is-skipped" : ""}
            >
              <time dateTime={entry.date}>
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${entry.date}T00:00:00Z`))}
              </time>
              <span>
                {entry.state === "Skipped"
                  ? `Skipped · ${entry.reason}`
                  : "Scheduled"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="wo-help">
          Enter valid schedule and exclusion dates to see a preview.
        </p>
      )}
    </div>
  );
}
