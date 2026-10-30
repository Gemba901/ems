"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  Package,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useAssets } from "../AssetsProvider";
import { useAssetOperators } from "../useAssetOperators";
import { useHealthCheckups } from "../health-checkups/HealthCheckupsProvider";
import { useInspections } from "../inspections/InspectionsProvider";
import { useWorkOrders } from "./WorkOrdersProvider";
import { useWorkOrderDepartments } from "./useWorkOrderDepartments";
import { validateWorkOrderInput } from "./work-order-preview";
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SAFETY_TAGS,
  WORK_ORDER_TYPES,
  emptyWorkOrder,
  formatWorkOrderMoney,
  plannedWorkOrderTotals,
  type WorkOrder,
  type WorkOrderInput,
} from "./work-order-types";
import { WorkOrderAssetPicker } from "./WorkOrderAssetPicker";
import { WorkOrderAttachments } from "./WorkOrderAttachments";
import { WorkOrderDocuments } from "./WorkOrderDocuments";
import { WorkOrderStepper, WORK_ORDER_STEPS } from "./WorkOrderStepper";
import "./work-order-list-form.css";

type EditorProps = {
  order?: WorkOrder;
  onSaved?: (order: WorkOrder) => void;
  onCancel?: () => void;
};

const STEP_FIELDS = [
  [
    "title",
    "assetId",
    "type",
    "priority",
    "departmentId",
    "departmentName",
    "team",
    "assigneeId",
    "assigneeName",
  ],
  ["estimatedDuration", "plannedStart", "dueAt", "tasks"],
  [
    "checklistId",
    "safetyTags",
    "permitRequired",
    "permitReference",
    "documents",
    "attachments",
  ],
  ["plannedMaterials", "plannedLabour", "estimatedBudget"],
  ["description", "safetyNotes"],
] as const;

function stepForField(field: string) {
  const key = field.split(".")[0];
  const index = STEP_FIELDS.findIndex((fields) =>
    (fields as readonly string[]).includes(key),
  );
  return index === -1 ? 0 : index;
}

export function WorkOrderEditor(props: EditorProps) {
  const assets = useAssets();
  const workOrders = useWorkOrders();
  const inspections = useInspections();
  const healthCheckups = useHealthCheckups();
  if (
    assets.loading ||
    workOrders.loading ||
    inspections.loading ||
    healthCheckups.loading
  )
    return (
      <div className="wo-empty" role="status">
        Loading work order form…
      </div>
    );
  const error =
    assets.error ||
    workOrders.error ||
    inspections.error ||
    healthCheckups.error;
  if (error)
    return (
      <div className="wo-empty" role="alert">
        <h2>Could not load the form</h2>
        <p>{error}</p>
        <button
          type="button"
          className="tpm-button"
          onClick={() => {
            assets.retry();
            workOrders.retry();
            inspections.retry();
          }}
        >
          Try again
        </button>
      </div>
    );
  return <EditorForm key={props.order?.id ?? "new"} {...props} />;
}

function localDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EditorForm({ order, onSaved, onCancel }: EditorProps) {
  const { assets } = useAssets();
  const { checklists, reports } = useInspections();
  const { checkups, linkWorkOrder } = useHealthCheckups();
  const { create, updateDetails, saveDraft, releaseDraft } = useWorkOrders();
  const operators = useAssetOperators();
  const departments = useWorkOrderDepartments();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState<WorkOrderInput>(() => {
    if (order)
      return {
        ...order,
        plannedStart: localDate(order.plannedStart),
        dueAt: localDate(order.dueAt),
      };
    const input = emptyWorkOrder();
    const report = reports.find((report) => report.id === params.get("report"));
    const item = report?.items.find((item) => item.id === params.get("item"));
    const checkup = checkups.find(
      (entry) => entry.id === params.get("checkup"),
    );
    const checkupItem = checkup?.items.find(
      (entry) => entry.id === params.get("item"),
    );
    if (report && item) {
      input.assetId = report.assetId;
      input.title = `Repair: ${item.title}`.slice(0, 200);
      const answer = report.answers[item.id];
      input.description = [
        `Raised from inspection ${report.code}: ${report.checklistName}`,
        `Finding: ${item.title}`,
        answer?.value ? `Response: ${answer.value}` : "",
        answer?.note ? `Notes: ${answer.note}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000);
    } else if (checkup) {
      input.assetId = checkup.assetId;
      input.title = (
        checkupItem
          ? `Repair: ${checkupItem.title}`
          : `Corrective work: ${checkup.standardName}`
      ).slice(0, 200);
      const answer = checkupItem
        ? checkup.answers[checkupItem.id]
        : undefined;
      input.description = [
        `Raised from health checkup ${checkup.code}: ${checkup.standardName}`,
        checkup.healthStatus
          ? `Health result: ${checkup.healthStatus}${checkup.score != null ? ` (score ${checkup.score})` : ""}`
          : "",
        checkupItem ? `Finding: ${checkupItem.title}` : "",
        answer?.value ? `Reading: ${answer.value}` : "",
        answer?.note ? `Notes: ${answer.note}` : "",
        !checkupItem && checkup.problems.length
          ? `Problems: ${checkup.problems.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000);
    } else if (params.get("asset")) input.assetId = params.get("asset") ?? "";
    return input;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readingDocuments, setDocumentsBusy] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  const documentsBusy = readingDocuments || photosBusy;
  const [dirty, setDirty] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [baseUpdatedAt] = useState(order?.updatedAt);
  const isDraft = order?.status === "Draft";
  const planning = plannedWorkOrderTotals(form);
  const hasAnswers =
    !!order &&
    Object.values(order.answers).some(
      (answer) => answer.value.trim() || answer.note.trim(),
    );
  const tasksLocked =
    !!order &&
    (Object.keys(order.taskResults).length > 0 ||
      Object.keys(order.taskTimeEntries ?? {}).length > 0);
  const assetLocked =
    !!order &&
    (hasAnswers ||
      tasksLocked ||
      order.labour.length > 0 ||
      order.materials.length > 0 ||
      order.expenses.length > 0 ||
      order.scrap.length > 0);
  const published = checklists.filter(
    (checklist) => checklist.status === "Published",
  );
  const missingAssignee =
    form.assigneeId &&
    !operators.members.some((member) => member.id === form.assigneeId);
  const missingDepartment =
    form.departmentId &&
    !departments.departments.some(
      (department) => department.id === form.departmentId,
    );

  function update<K extends keyof WorkOrderInput>(
    key: K,
    value: WorkOrderInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([field]) => field !== key && !field.startsWith(`${key}.`),
        ),
      ),
    );
    setDirty(true);
  }
  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved work order changes?"))
      return;
    if (onCancel) onCancel();
    else router.push("/tpm/work-orders");
  }
  function errorFor(key: string) {
    return Object.entries(errors).find(
      ([field]) => field === key || field.startsWith(`${key}.`),
    )?.[1];
  }
  function errorMessage(key: string) {
    const message = errorFor(key);
    return message ? (
      <p className="wo-form-error" id={`wo-error-${key}`} role="alert">
        {message}
      </p>
    ) : null;
  }
  function field(
    key:
      | "title"
      | "plannedStart"
      | "dueAt"
      | "estimatedBudget"
      | "estimatedDuration"
      | "team"
      | "permitReference",
    label: string,
    type = "text",
    required = false,
    placeholder?: string,
  ) {
    return (
      <div className="wo-field">
        <label htmlFor={`wo-${key}`}>
          {label}
          {required && <span aria-label="required"> *</span>}
        </label>
        <input
          id={`wo-${key}`}
          name={key}
          type={type}
          value={form[key]}
          onChange={(event) => update(key, event.target.value)}
          required={required}
          placeholder={placeholder}
          maxLength={key === "title" ? 200 : type === "text" ? 200 : undefined}
          min={
            type === "number"
              ? key === "estimatedDuration"
                ? "0.01"
                : "0"
              : undefined
          }
          max={type === "number" ? "1000000000" : undefined}
          step={type === "number" ? "0.01" : undefined}
          aria-invalid={!!errorFor(key)}
          aria-describedby={errorFor(key) ? `wo-error-${key}` : undefined}
        />
        {errorMessage(key)}
      </div>
    );
  }
  function section(
    step: number,
    title: string,
    description: string,
    icon: ReactNode,
    children: ReactNode,
  ) {
    if (activeStep !== step) return null;
    return (
      <section className="wo-form-section">
        <div className="wo-section-heading">
          <span>{icon}</span>
          <div>
            <h2 tabIndex={-1}>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <div className="wo-form-fields">{children}</div>
      </section>
    );
  }
  function validate(draft = false, beforeStep = 5) {
    if (order && order.updatedAt !== baseUpdatedAt) {
      setSaveError(
        "This work order changed while you were editing. Cancel and reopen Edit details to load the latest version.",
      );
      return false;
    }
    const nextErrors = validateWorkOrderInput(form, draft);
    const selected = assets.find((asset) => asset.id === form.assetId);
    if (
      !draft &&
      (!order || isDraft || order.assetId !== form.assetId) &&
      (!selected ||
        selected.stage !== "Registered" ||
        selected.usage === "Retired")
    )
      nextErrors.assetId =
        "Select a registered asset that has not been retired.";
    const visibleErrors = Object.fromEntries(
      Object.entries(nextErrors).filter(
        ([field]) => stepForField(field) < beforeStep,
      ),
    );
    setErrors(visibleErrors);
    setSaveError("");
    if (Object.keys(visibleErrors).length) {
      setActiveStep(Math.min(...Object.keys(visibleErrors).map(stepForField)));
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"], [data-invalid="true"]',
        );
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return false;
    }
    return true;
  }
  function goToStep(next: number) {
    if (saving || documentsBusy || next === activeStep || next < 0 || next > 5)
      return;
    if (next > activeStep && !validate(false, next)) return;
    setActiveStep(next);
    setSaveError("");
    requestAnimationFrame(() => {
      const heading =
        next === 5
          ? reviewRef.current
          : formRef.current?.querySelector<HTMLElement>("h2");
      heading?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  function persist(draft = false) {
    if (saving || documentsBusy) return;
    if (!validate(draft)) return;
    setSaving(true);
    try {
      const saved = draft
        ? saveDraft(form, order?.id)
        : isDraft && order
          ? releaseDraft(order.id, form)
          : order
            ? updateDetails(order.id, form)
            : create(form);
      setDirty(false);
      const checkupId = params.get("checkup");
      if (!order && checkupId) {
        try {
          linkWorkOrder(checkupId, saved.id);
        } catch {
          // Work order is saved; linking is best-effort for the preview.
        }
      }
      toast(
        draft
          ? "Work order draft saved"
          : isDraft
            ? "Work order released successfully"
            : order
              ? "Work order updated successfully"
              : "Work order created successfully",
        "success",
      );
      if (onSaved) onSaved(saved);
      else
        router.push(`/tpm/work-orders/${saved.id}${draft ? "" : "?created=1"}`);
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save this work order. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    goToStep(Math.min(activeStep + 1, 5));
  }
  function rowInput(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      number?: boolean;
      required?: boolean;
      placeholder?: string;
      maxLength?: number;
    } = {},
  ) {
    return (
      <label className="wo-plan-cell">
        <span>
          {label}
          {options.required ? " *" : ""}
        </span>
        <input
          aria-label={label}
          type={options.number ? "number" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={options.number ? "0" : undefined}
          max={options.number ? "1000000000" : undefined}
          step={options.number ? "0.01" : undefined}
          maxLength={options.number ? undefined : (options.maxLength ?? 200)}
          placeholder={options.placeholder}
        />
      </label>
    );
  }

  if (activeStep === 5) {
    const selectedAsset = assets.find((asset) => asset.id === form.assetId);
    const selectedChecklist =
      checklists.find((checklist) => checklist.id === form.checklistId) ??
      order?.checklist;
    const dateText = (value: string) =>
      value ? new Date(value).toLocaleString() : "Not set";
    return (
      <div className="wo-editor wo-review" ref={editorRef}>
        <button
          type="button"
          className="wo-back-link wo-back-button"
          onClick={() => goToStep(4)}
        >
          <ArrowLeft size={16} />
          Back to remarks & notes
        </button>
        <header className="wo-page-heading">
          <div>
            <h1 tabIndex={-1} ref={reviewRef}>
              Review work order
            </h1>
            <p>
              Check the plan before{" "}
              {isDraft
                ? "releasing this draft"
                : order
                  ? "saving your changes"
                  : "creating the work order"}
              .
            </p>
          </div>
          <span className="wo-review-step">
            <Check size={14} />
            Details complete
          </span>
        </header>
        <WorkOrderStepper
          activeStep={activeStep}
          onStepChange={goToStep}
          disabled={saving || documentsBusy}
        />
        <section className="wo-form-section">
          <div className="wo-review-title">
            <span className="wo-status wo-status-open">
              {order && !isDraft ? order.status : "Will open for work"}
            </span>
            <h2>{form.title}</h2>
            <p>
              {selectedAsset?.name || order?.assetName} ·{" "}
              {selectedAsset?.code || order?.assetCode}
            </p>
          </div>
          <dl className="wo-review-grid">
            <ReviewField title="Maintenance type" value={form.type} />
            <ReviewField title="Priority" value={form.priority} />
            <ReviewField
              title="Department"
              value={form.departmentName || "Not selected"}
            />
            <ReviewField
              title="Maintenance team"
              value={form.team || "Not set"}
            />
            <ReviewField
              title="Assigned person"
              value={form.assigneeName || "Unassigned"}
            />
            <ReviewField
              title="Estimated duration"
              value={
                form.estimatedDuration
                  ? `${form.estimatedDuration} hours`
                  : "Not set"
              }
            />
            <ReviewField
              title="Planned start"
              value={dateText(form.plannedStart)}
            />
            <ReviewField title="Due date & time" value={dateText(form.dueAt)} />
            <ReviewField
              title="Estimated budget"
              value={
                form.estimatedBudget.trim()
                  ? formatWorkOrderMoney(Number(form.estimatedBudget))
                  : "Not set"
              }
            />
            <ReviewField
              title="Inspection checklist"
              value={
                form.checklistId
                  ? selectedChecklist?.name || "Unavailable checklist"
                  : "No checklist"
              }
            />
          </dl>
          {form.description && (
            <div className="wo-review-notes">
              <h3>Description</h3>
              <p>{form.description}</p>
            </div>
          )}
        </section>
        <section className="wo-form-section wo-review-section">
          <h2>
            Work tasks <span>{form.tasks.length}</span>
          </h2>
          {form.tasks.length ? (
            <ol className="wo-review-tasks">
              {form.tasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong>
                  <span>
                    Complete with Start / Stop
                    {task.estimatedHours
                      ? ` · ${task.estimatedHours} hours`
                      : ""}
                  </span>
                  {task.description && <p>{task.description}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="wo-muted">No separate work tasks added.</p>
          )}
        </section>
        <section className="wo-form-section wo-review-section">
          <h2>Planned materials & labour</h2>
          {form.plannedMaterials.length > 0 && (
            <div className="wo-review-rows">
              <h3>Materials</h3>
              {form.plannedMaterials.map((row) => (
                <div key={row.id}>
                  <span>
                    {row.name}
                    <small>
                      {row.quantity} {row.unit}
                    </small>
                  </span>
                  <strong>
                    {row.unitCost.trim()
                      ? formatWorkOrderMoney(
                          Number(row.quantity) * Number(row.unitCost),
                        )
                      : "Rate pending"}
                  </strong>
                </div>
              ))}
            </div>
          )}
          {form.plannedLabour.length > 0 && (
            <div className="wo-review-rows">
              <h3>Labour</h3>
              {form.plannedLabour.map((row) => (
                <div key={row.id}>
                  <span>
                    {row.technician}
                    <small>{row.hours} hours</small>
                  </span>
                  <strong>
                    {row.hourlyRate.trim()
                      ? formatWorkOrderMoney(
                          Number(row.hours) * Number(row.hourlyRate),
                        )
                      : "Rate pending"}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <PlanningTotals input={form} />
        </section>
        <section className="wo-form-section wo-review-section">
          <h2>Safety & documents</h2>
          <div className="wo-review-safety">
            {form.safetyTags.length ? (
              form.safetyTags.map((tag) => <span key={tag}>{tag}</span>)
            ) : (
              <p className="wo-muted">No safety tags added.</p>
            )}
          </div>
          <p className="wo-review-permit">
            Permit required:{" "}
            <strong>{form.permitRequired ? "Yes" : "No"}</strong>
            {form.permitRequired &&
              (form.permitReference
                ? ` · ${form.permitReference}`
                : " · Reference not recorded")}
          </p>
          {form.safetyNotes && (
            <p className="wo-review-copy">{form.safetyNotes}</p>
          )}
          <WorkOrderDocuments
            value={form.documents}
            onChange={() => undefined}
            readOnly
          />
          {form.attachments.length > 0 && (
            <WorkOrderAttachments
              value={form.attachments}
              onChange={() => undefined}
              readOnly
              label="Problem photos"
            />
          )}
        </section>
        {saveError && (
          <div className="wo-save-error" role="alert">
            {saveError}
          </div>
        )}
        <footer className="wo-editor-actions">
          <span>
            Actual labour, materials and scrap are recorded while carrying out
            the work.
          </span>
          {(!order || isDraft) && (
            <button
              type="button"
              className="tpm-button"
              disabled={saving || documentsBusy}
              onClick={() => persist(true)}
            >
              <Save size={16} /> Save draft
            </button>
          )}
          <button
            type="button"
            className="tpm-button"
            disabled={saving}
            onClick={() => goToStep(4)}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            type="button"
            className="tpm-button tpm-button-primary"
            disabled={saving}
            onClick={() => persist()}
          >
            <Check size={17} />
            {saving
              ? "Saving…"
              : isDraft
                ? "Release work order"
                : order
                  ? "Save changes"
                  : "Create work order"}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="wo-editor" ref={editorRef}>
      {!order && (
        <Link className="wo-back-link" href="/tpm/work-orders">
          <ArrowLeft size={16} />
          Work orders
        </Link>
      )}
      <header className="wo-page-heading">
        <div>
          <h1>
            {isDraft
              ? "Edit draft"
              : order
                ? "Edit work order"
                : "New work order"}
          </h1>
          <p>
            {order
              ? `Update the plan for ${order.code}.`
              : "Define the work, assign an owner, and set a due date."}
          </p>
        </div>
        <span className="wo-required-note">* Required to release</span>
      </header>
      <WorkOrderStepper
        activeStep={activeStep}
        onStepChange={goToStep}
        disabled={saving || documentsBusy}
      />
      <form ref={formRef} noValidate onSubmit={submit}>
        <fieldset
          disabled={saving || documentsBusy}
          className="wo-form-fieldset"
        >
          {section(
            0,
            "Basic info",
            "What needs attention?",
            <Wrench size={20} />,
            <>
              <div className="wo-field-wide">
                {field(
                  "title",
                  "Work order title",
                  "text",
                  true,
                  "e.g. Replace the worn conveyor belt",
                )}
              </div>
              <div>
                <WorkOrderAssetPicker
                  assets={assets}
                  value={form.assetId}
                  onChange={(value) => update("assetId", value)}
                  error={errors.assetId}
                  disabled={assetLocked}
                />
                {assetLocked && (
                  <p className="wo-help">
                    Asset is fixed once work has been recorded.
                  </p>
                )}
              </div>
              <div className="wo-field">
                <label htmlFor="wo-type">
                  Maintenance type <span aria-label="required">*</span>
                </label>
                <select
                  id="wo-type"
                  value={form.type}
                  onChange={(event) =>
                    update("type", event.target.value as WorkOrderInput["type"])
                  }
                >
                  {WORK_ORDER_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="wo-field">
                <label htmlFor="wo-priority">
                  Priority <span aria-label="required">*</span>
                </label>
                <select
                  id="wo-priority"
                  value={form.priority}
                  onChange={(event) =>
                    update(
                      "priority",
                      event.target.value as WorkOrderInput["priority"],
                    )
                  }
                >
                  {WORK_ORDER_PRIORITIES.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </div>
            </>,
          )}
          {section(
            0,
            "Assignment",
            "Choose the team and person responsible for the work.",
            <CalendarClock size={20} />,
            <>
              <div className="wo-field">
                <label htmlFor="wo-department">
                  Department <small>Optional</small>
                </label>
                <select
                  id="wo-department"
                  value={form.departmentId}
                  disabled={
                    !departments.enabled ||
                    departments.loading ||
                    departments.failed
                  }
                  aria-invalid={!!errorFor("departmentId")}
                  onChange={(event) => {
                    const selected = departments.departments.find(
                      (department) => department.id === event.target.value,
                    );
                    setForm((current) => ({
                      ...current,
                      departmentId: selected?.id ?? "",
                      departmentName: selected?.name ?? "",
                    }));
                    setDirty(true);
                    setErrors((current) => ({
                      ...current,
                      departmentId: "",
                      departmentName: "",
                    }));
                  }}
                >
                  <option value="">
                    {departments.loading
                      ? "Loading departments…"
                      : "No department selected"}
                  </option>
                  {missingDepartment && (
                    <option value={form.departmentId}>
                      {form.departmentName} (saved selection)
                    </option>
                  )}
                  {departments.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
                <p className="wo-help">
                  {departments.failed
                    ? "Departments could not be loaded. You can add one later."
                    : !departments.enabled
                      ? "Organization departments are not available for this account."
                      : "Departments from your organization."}
                </p>
                {errorMessage("departmentId")}
                {errorMessage("departmentName")}
              </div>
              {field(
                "team",
                "Maintenance team",
                "text",
                false,
                "e.g. Mechanical maintenance",
              )}
              <div className="wo-field">
                <label htmlFor="wo-assignee">
                  Assigned person <small>Optional</small>
                </label>
                <select
                  id="wo-assignee"
                  aria-invalid={
                    !!errorFor("assigneeId") || !!errorFor("assigneeName")
                  }
                  value={form.assigneeId}
                  disabled={
                    !operators.enabled || operators.loading || operators.failed
                  }
                  onChange={(event) => {
                    const member = operators.members.find(
                      (member) => member.id === event.target.value,
                    );
                    setForm((current) => ({
                      ...current,
                      assigneeId: member?.id ?? "",
                      assigneeName: member?.name ?? "",
                    }));
                    setDirty(true);
                    setErrors((current) => ({
                      ...current,
                      assigneeId: "",
                      assigneeName: "",
                    }));
                  }}
                  aria-describedby="wo-assignee-hint"
                >
                  <option value="">
                    {operators.loading ? "Loading members…" : "Unassigned"}
                  </option>
                  {missingAssignee && (
                    <option value={form.assigneeId}>
                      {form.assigneeName || "Saved assignee"} (saved selection)
                    </option>
                  )}
                  {operators.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
                <p className="wo-help" id="wo-assignee-hint">
                  {operators.failed
                    ? "Could not load members. You can leave this unassigned."
                    : !operators.orgId
                      ? "Select an organization to choose a member."
                      : !operators.canViewMembers
                        ? "Your role cannot view organization members. You can leave this unassigned."
                        : "Choose the person responsible for this work order."}
                </p>
                {operators.failed && (
                  <button
                    type="button"
                    className="wo-text-button"
                    onClick={() => void operators.query.refetch()}
                  >
                    Retry loading members
                  </button>
                )}
                {errorMessage("assigneeId")}
                {errorMessage("assigneeName")}
              </div>
            </>,
          )}
          {section(
            1,
            "Schedule & duration",
            "Plan when the work should begin and finish.",
            <CalendarClock size={20} />,
            <>
              {field(
                "estimatedDuration",
                "Estimated duration (hours)",
                "number",
                false,
                "e.g. 2.5",
              )}
              {field("plannedStart", "Planned start", "datetime-local")}
              {field("dueAt", "Due date & time", "datetime-local", true)}
            </>,
          )}
          {section(
            1,
            "Work tasks",
            `${form.tasks.length} tasks - Every task completes when its timer is stopped.`,
            <ClipboardCheck size={20} />,
            <>
              <div
                className="wo-field-wide wo-plan-group"
                tabIndex={-1}
                aria-invalid={!!errorFor("tasks")}
              >
                <div className="wo-subheading">
                  <div>
                    <h3>Work tasks</h3>
                    <p>Steps the technician follows to carry out this job.</p>
                  </div>
                  <button
                    type="button"
                    className="tpm-button wo-add-row"
                    disabled={tasksLocked || form.tasks.length >= 50}
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
                {tasksLocked && (
                  <p className="wo-help">
                    Task definitions are fixed once task progress has been
                    recorded.
                  </p>
                )}
                {!form.tasks.length && (
                  <p className="wo-plan-empty">
                    Add steps such as isolate equipment, replace the part, and
                    test operation.
                  </p>
                )}
                <fieldset className="wo-form-fieldset" disabled={tasksLocked}>
                  {form.tasks.map((task, index) => (
                    <div className="wo-task-editor" key={task.id}>
                      <div className="wo-task-editor-heading">
                        <span>Task {index + 1}</span>
                        <button
                          type="button"
                          className="wo-row-remove"
                          aria-label={`Remove task ${index + 1}`}
                          onClick={() =>
                            update(
                              "tasks",
                              form.tasks.filter((row) => row.id !== task.id),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="wo-task-editor-grid">
                        {rowInput(
                          `Task ${index + 1} title`,
                          task.title,
                          (value) =>
                            update(
                              "tasks",
                              form.tasks.map((row) =>
                                row.id === task.id
                                  ? { ...row, title: value }
                                  : row,
                              ),
                            ),
                          {
                            required: true,
                            placeholder: "e.g. Replace the worn belt",
                          },
                        )}
                        {rowInput(
                          `Task ${index + 1} estimated hours`,
                          task.estimatedHours,
                          (value) =>
                            update(
                              "tasks",
                              form.tasks.map((row) =>
                                row.id === task.id
                                  ? { ...row, estimatedHours: value }
                                  : row,
                              ),
                            ),
                          { number: true, placeholder: "Optional" },
                        )}
                        <label className="wo-plan-cell wo-field-wide">
                          <span>Task {index + 1} instructions</span>
                          <textarea
                            aria-label={`Task ${index + 1} instructions`}
                            rows={2}
                            maxLength={4000}
                            value={task.description}
                            placeholder="Procedure, expected result, or reference…"
                            onChange={(event) =>
                              update(
                                "tasks",
                                form.tasks.map((row) =>
                                  row.id === task.id
                                    ? {
                                        ...row,
                                        description: event.target.value,
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </fieldset>
                {errorMessage("tasks")}
              </div>
            </>,
          )}
          {section(
            2,
            "Inspection checklist",
            "Attach a checklist to capture readings and inspection results.",
            <ClipboardCheck size={20} />,
            <>
              <div className="wo-field wo-field-wide">
                <label htmlFor="wo-checklist">
                  Inspection checklist <small>Optional</small>
                </label>
                <select
                  id="wo-checklist"
                  value={form.checklistId}
                  disabled={hasAnswers}
                  onChange={(event) =>
                    update("checklistId", event.target.value)
                  }
                  aria-invalid={!!errorFor("checklistId")}
                >
                  <option value="">No checklist</option>
                  {order?.checklist &&
                    !published.some(
                      (item) => item.id === order.checklistId,
                    ) && (
                      <option value={order.checklistId}>
                        {order.checklist.name} (saved copy)
                      </option>
                    )}
                  {published.map((checklist) => (
                    <option value={checklist.id} key={checklist.id}>
                      {checklist.name} · {checklist.kind} ·{" "}
                      {checklist.items.length} checks
                    </option>
                  ))}
                </select>
                <p className="wo-help">
                  {hasAnswers
                    ? "The checklist is fixed once responses have been recorded."
                    : "Attach a published inspection checklist to record checks alongside the work tasks."}
                </p>
                {errorMessage("checklistId")}
                {!published.length && !order?.checklist && (
                  <Link href="/tpm/inspections" className="wo-text-button">
                    Manage inspection checklists
                  </Link>
                )}
              </div>
            </>,
          )}
          {section(
            3,
            "Cost & budget",
            `${form.plannedMaterials.length} materials · ${form.plannedLabour.length} labour entries${planning.hasEntries ? ` · ${planning.pending ? "Estimate pending" : formatWorkOrderMoney(planning.total)}` : ""}`,
            <Package size={20} />,
            <>
              <div
                className="wo-field-wide wo-plan-group"
                tabIndex={-1}
                aria-invalid={!!errorFor("plannedMaterials")}
              >
                <div className="wo-subheading">
                  <div>
                    <h3>Planned materials</h3>
                    <p>Parts and consumables expected for this job.</p>
                  </div>
                  <button
                    type="button"
                    className="tpm-button wo-add-row"
                    disabled={form.plannedMaterials.length >= 100}
                    onClick={() =>
                      update("plannedMaterials", [
                        ...form.plannedMaterials,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          quantity: "",
                          unit: "pcs",
                          unitCost: "",
                        },
                      ])
                    }
                  >
                    <Plus size={15} />
                    Add planned material
                  </button>
                </div>
                {!form.plannedMaterials.length && (
                  <p className="wo-plan-empty">No materials planned yet.</p>
                )}
                {form.plannedMaterials.map((row, index) => (
                  <div
                    className="wo-plan-row wo-material-plan-row"
                    key={row.id}
                  >
                    {rowInput(
                      `Planned material ${index + 1}`,
                      row.name,
                      (value) =>
                        update(
                          "plannedMaterials",
                          form.plannedMaterials.map((item) =>
                            item.id === row.id
                              ? { ...item, name: value }
                              : item,
                          ),
                        ),
                      { required: true, placeholder: "Part / material name" },
                    )}
                    {rowInput(
                      `Material ${index + 1} quantity`,
                      row.quantity,
                      (value) =>
                        update(
                          "plannedMaterials",
                          form.plannedMaterials.map((item) =>
                            item.id === row.id
                              ? { ...item, quantity: value }
                              : item,
                          ),
                        ),
                      { number: true, required: true },
                    )}
                    {rowInput(
                      `Material ${index + 1} unit`,
                      row.unit,
                      (value) =>
                        update(
                          "plannedMaterials",
                          form.plannedMaterials.map((item) =>
                            item.id === row.id
                              ? { ...item, unit: value }
                              : item,
                          ),
                        ),
                      { required: true, maxLength: 30 },
                    )}
                    {rowInput(
                      `Material ${index + 1} unit cost (₹)`,
                      row.unitCost,
                      (value) =>
                        update(
                          "plannedMaterials",
                          form.plannedMaterials.map((item) =>
                            item.id === row.id
                              ? { ...item, unitCost: value }
                              : item,
                          ),
                        ),
                      { number: true, placeholder: "Pending" },
                    )}
                    <button
                      type="button"
                      className="wo-row-remove"
                      aria-label={`Remove planned material ${index + 1}`}
                      onClick={() =>
                        update(
                          "plannedMaterials",
                          form.plannedMaterials.filter(
                            (item) => item.id !== row.id,
                          ),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {errorMessage("plannedMaterials")}
              </div>
              <div
                className="wo-field-wide wo-plan-group"
                tabIndex={-1}
                aria-invalid={!!errorFor("plannedLabour")}
              >
                <div className="wo-subheading">
                  <div>
                    <h3>Planned labour</h3>
                    <p>People or skills and the time you expect to need.</p>
                  </div>
                  <button
                    type="button"
                    className="tpm-button wo-add-row"
                    disabled={form.plannedLabour.length >= 100}
                    onClick={() =>
                      update("plannedLabour", [
                        ...form.plannedLabour,
                        {
                          id: crypto.randomUUID(),
                          technician: "",
                          hours: "",
                          hourlyRate: "",
                        },
                      ])
                    }
                  >
                    <Plus size={15} />
                    Add planned labour
                  </button>
                </div>
                {!form.plannedLabour.length && (
                  <p className="wo-plan-empty">No labour planned yet.</p>
                )}
                {form.plannedLabour.map((row, index) => (
                  <div className="wo-plan-row wo-labour-plan-row" key={row.id}>
                    {rowInput(
                      `Planned technician / skill ${index + 1}`,
                      row.technician,
                      (value) =>
                        update(
                          "plannedLabour",
                          form.plannedLabour.map((item) =>
                            item.id === row.id
                              ? { ...item, technician: value }
                              : item,
                          ),
                        ),
                      {
                        required: true,
                        placeholder: "e.g. Mechanical technician",
                      },
                    )}
                    {rowInput(
                      `Labour ${index + 1} hours`,
                      row.hours,
                      (value) =>
                        update(
                          "plannedLabour",
                          form.plannedLabour.map((item) =>
                            item.id === row.id
                              ? { ...item, hours: value }
                              : item,
                          ),
                        ),
                      { required: true, number: true },
                    )}
                    {rowInput(
                      `Labour ${index + 1} hourly rate (₹)`,
                      row.hourlyRate,
                      (value) =>
                        update(
                          "plannedLabour",
                          form.plannedLabour.map((item) =>
                            item.id === row.id
                              ? { ...item, hourlyRate: value }
                              : item,
                          ),
                        ),
                      { number: true, placeholder: "Pending" },
                    )}
                    <button
                      type="button"
                      className="wo-row-remove"
                      aria-label={`Remove planned labour ${index + 1}`}
                      onClick={() =>
                        update(
                          "plannedLabour",
                          form.plannedLabour.filter(
                            (item) => item.id !== row.id,
                          ),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {errorMessage("plannedLabour")}
              </div>
              <div className="wo-field-wide">
                <PlanningTotals input={form} />
                <p className="wo-help">
                  Leave an unknown rate blank. Planned quantities and costs are
                  estimates; record actual usage and costs during the work.
                </p>
              </div>
              {field(
                "estimatedBudget",
                "Estimated budget (₹)",
                "number",
                false,
                "Optional spending estimate",
              )}
            </>,
          )}
          {section(
            2,
            "Safety requirements",
            `${form.safetyTags.length} tags${form.permitRequired ? " · Permit required" : " · Add precautions and permit details"}`,
            <ShieldCheck size={20} />,
            <>
              <fieldset className="wo-form-fieldset wo-field-wide">
                <legend className="wo-field-label">Safety tags</legend>
                <div className="wo-safety-options">
                  {WORK_ORDER_SAFETY_TAGS.map((tag) => (
                    <label
                      key={tag}
                      className={
                        form.safetyTags.includes(tag) ? "is-selected" : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={form.safetyTags.includes(tag)}
                        onChange={(event) =>
                          update(
                            "safetyTags",
                            event.target.checked
                              ? [...form.safetyTags, tag]
                              : form.safetyTags.filter(
                                  (value) => value !== tag,
                                ),
                          )
                        }
                      />
                      {tag}
                    </label>
                  ))}
                </div>
                {errorMessage("safetyTags")}
              </fieldset>
              <label className="wo-plan-check wo-field-wide">
                <input
                  type="checkbox"
                  checked={form.permitRequired}
                  onChange={(event) =>
                    update("permitRequired", event.target.checked)
                  }
                />
                Work permit required
              </label>
              {form.permitRequired &&
                field(
                  "permitReference",
                  "Permit reference",
                  "text",
                  false,
                  "Add now or before starting work",
                )}
            </>,
          )}
          {section(
            2,
            "Documents & photos",
            `${form.documents.length} documents · ${form.attachments.length} photos`,
            <FileText size={20} />,
            <>
              <div
                className="wo-field-wide"
                tabIndex={-1}
                aria-invalid={!!errorFor("documents")}
              >
                <WorkOrderDocuments
                  value={form.documents}
                  onChange={(value) => update("documents", value)}
                  onBusyChange={setDocumentsBusy}
                />
                {errorMessage("documents")}
              </div>
              <div
                className="wo-field-wide"
                tabIndex={-1}
                aria-invalid={!!errorFor("attachments")}
              >
                <WorkOrderAttachments
                  value={form.attachments}
                  onChange={(value) => update("attachments", value)}
                  onBusyChange={setPhotosBusy}
                  label="Problem photos"
                />
                {errorMessage("attachments")}
              </div>
            </>,
          )}
          {section(
            4,
            "Remarks & notes",
            "Add the problem description and precautions for the person doing the work.",
            <FileText size={20} />,
            <>
              <div className="wo-field wo-field-wide">
                <label htmlFor="wo-description">
                  Description / problem details <small>Optional</small>
                </label>
                <textarea
                  id="wo-description"
                  rows={3}
                  maxLength={4000}
                  placeholder="Describe the issue, symptoms, and work required…"
                  value={form.description}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                  aria-invalid={!!errorFor("description")}
                />
                {errorMessage("description")}
              </div>
              <div className="wo-field wo-field-wide">
                <label htmlFor="wo-safety-notes">
                  Safety notes / precautions
                </label>
                <textarea
                  id="wo-safety-notes"
                  rows={3}
                  maxLength={4000}
                  value={form.safetyNotes}
                  onChange={(event) =>
                    update("safetyNotes", event.target.value)
                  }
                  placeholder="Isolation steps, protective equipment, or other precautions…"
                  aria-invalid={!!errorFor("safetyNotes")}
                />
                {errorMessage("safetyNotes")}
              </div>
            </>,
          )}
          {saveError && (
            <div className="wo-save-error" role="alert">
              {saveError}
            </div>
          )}
          <footer className="wo-editor-actions">
            <span>
              Step {activeStep + 1} of {WORK_ORDER_STEPS.length} ·{" "}
              {WORK_ORDER_STEPS[activeStep]}
            </span>
            <button type="button" className="tpm-button" onClick={cancel}>
              Cancel
            </button>
            {(!order || isDraft) && (
              <button
                type="button"
                className="tpm-button"
                onClick={() => persist(true)}
              >
                <Save size={16} />
                Save draft
              </button>
            )}
            <button
              type="button"
              className="tpm-button"
              disabled={activeStep === 0}
              onClick={() => goToStep(activeStep - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button type="submit" className="tpm-button tpm-button-primary">
              {activeStep === 4 ? "Review work order" : "Next"}
              <ArrowRight size={17} />
            </button>
          </footer>
        </fieldset>
      </form>
    </div>
  );
}

function ReviewField({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PlanningTotals({ input }: { input: WorkOrderInput }) {
  const planning = plannedWorkOrderTotals(input);
  const materialsPending = input.plannedMaterials.some(
    (row) => !row.quantity.trim() || !row.unitCost.trim(),
  );
  const labourPending = input.plannedLabour.some(
    (row) => !row.hours.trim() || !row.hourlyRate.trim(),
  );
  return (
    <div className="wo-planning-totals">
      <div>
        <span>Planned materials</span>
        <strong>
          {!input.plannedMaterials.length
            ? "Not estimated"
            : materialsPending
              ? "Estimate pending"
              : formatWorkOrderMoney(planning.materials)}
        </strong>
      </div>
      <div>
        <span>Planned labour</span>
        <strong>
          {!input.plannedLabour.length
            ? "Not estimated"
            : labourPending
              ? "Estimate pending"
              : formatWorkOrderMoney(planning.labour)}
        </strong>
      </div>
      <div>
        <span>
          {planning.pending ? "Known estimate subtotal" : "Total planned cost"}
        </span>
        <strong>
          {planning.hasEntries
            ? formatWorkOrderMoney(planning.total)
            : "Not estimated"}
        </strong>
        {planning.pending && <small>Some rates are pending</small>}
      </div>
    </div>
  );
}
