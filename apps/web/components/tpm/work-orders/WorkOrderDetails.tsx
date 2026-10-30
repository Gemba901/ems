"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  Pencil,
  Plus,
  ShieldCheck,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  inspectionItemHasIssue,
  type InspectionItem,
} from "../inspections/inspection-preview";
import { useWorkOrders } from "./WorkOrdersProvider";
import { WorkOrderEditor } from "./WorkOrderEditor";
import { WorkOrderAttachments } from "./WorkOrderAttachments";
import { WorkOrderDocuments } from "./WorkOrderDocuments";
import { LabourCostsPanel, ScrapPanel } from "./WorkOrderFinancePanels";
import {
  WorkOrderTaskTimers,
  formatTaskTimestamp,
} from "./WorkOrderTaskTimers";
import { financialClosureError } from "./work-order-preview";
import {
  formatWorkOrderDuration,
  totalTaskDurationSeconds,
  formatWorkOrderMoney as money,
  isWorkOrderOverdue,
  plannedWorkOrderTotals,
  workOrderTotals,
  type WorkOrder,
  type WorkOrderCompletion,
  type WorkOrderStatus,
  type WorkOrderWork,
} from "./work-order-types";
import "./work-order-details.css";

const TABS = [
  "Overview",
  "Tasks",
  "Checklist",
  "Labour & costs",
  "Materials",
  "Scrap",
  "Activity",
] as const;
type Tab = (typeof TABS)[number];
const date = (value: string) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not set";
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not save your changes. Please try again.";
const amount = (value: string) => (value === "" ? Number.NaN : Number(value));
const inputNumber = (value: number | null) =>
  value !== null && Number.isFinite(value) ? value : "";
const workFrom = (order: WorkOrder): WorkOrderWork => ({
  labour: order.labour,
  materials: order.materials,
  expenses: order.expenses,
  scrap: order.scrap,
  costsReviewed: order.costsReviewed,
  answers: order.answers,
  taskResults: order.taskResults,
  taskTimeEntries: order.taskTimeEntries ?? {},
});

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`wo-field${wide ? " wod-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function requiredAnswerError(
  item: InspectionItem,
  work: WorkOrderWork,
): string | null {
  const answer = work.answers[item.id];
  const value = answer?.value.trim() ?? "";
  if (!value)
    return item.required
      ? `Complete “${item.title}” before finishing this work order.`
      : null;
  if (value === "NA")
    return item.allowNa ? null : `N/A is not allowed for “${item.title}”.`;
  if (item.responseType === "Number" && !Number.isFinite(Number(value)))
    return `Enter a valid reading for “${item.title}”.`;
  if (inspectionItemHasIssue(item, answer) && !answer?.note.trim())
    return `Add an issue note for “${item.title}”.`;
  return null;
}

export function WorkOrderDetails({ id }: { id: string }) {
  const { orders, loading, error, retry } = useWorkOrders();
  if (loading)
    return (
      <div className="wo-panel wo-empty" role="status">
        Loading work order…
      </div>
    );
  if (error)
    return (
      <div className="wo-panel wo-empty">
        <p role="alert">{error}</p>
        <button type="button" className="tpm-button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  const order = orders.find((item) => item.id === id);
  if (!order)
    return (
      <div className="wo-panel wo-empty">
        <ClipboardCheck size={32} />
        <h2>Work order not found</h2>
        <p>This work order is unavailable in your current workspace.</p>
        <Link href="/tpm/work-orders" className="tpm-button">
          Back to work orders
        </Link>
      </div>
    );
  return <WorkOrderDetailContent key={order.id} order={order} />;
}

function WorkOrderDetailContent({ order }: { order: WorkOrder }) {
  const {
    saveWork,
    setStatus,
    complete,
    setFinancialClosed,
    startTask,
    stopTask,
    saveCompletion,
  } = useWorkOrders();
  const [tab, setTab] = useState<Tab>("Overview");
  const [draft, setDraft] = useState<WorkOrderWork>(() => workFrom(order));
  const [baseRevision, setBaseRevision] = useState(order.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const work = dirty ? draft : workFrom(order);
  const hasConflict = dirty && baseRevision !== order.updatedAt;
  const isDraft = order.status === "Draft";
  const operationalReadOnly =
    isDraft || order.status === "Completed" || order.status === "Cancelled";
  const taskCompleted =
    order.status === "Completed" && order.completionMode === "tasks";
  const checklistReadOnly =
    operationalReadOnly && !(taskCompleted && order.financialStatus === "Open");
  const financialReadOnly =
    isDraft ||
    order.status === "Cancelled" ||
    order.financialStatus === "Closed";
  // The cost, material and scrap forms below follow the financial lifecycle.
  const readOnly = financialReadOnly;
  const detailsReadOnly =
    order.status === "Completed" || order.status === "Cancelled";
  const totals = workOrderTotals(work);
  const planned = plannedWorkOrderTotals(order);
  const tasksDone = order.tasks.filter(
    (task) => work.taskResults[task.id],
  ).length;
  const financialBlocker = financialClosureError({ ...order, ...work });
  const answered =
    order.checklist?.items.filter((item) =>
      Boolean(work.answers[item.id]?.value.trim()),
    ).length ?? 0;

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function change(next: Partial<WorkOrderWork>, costChange = true) {
    if (!dirty) setBaseRevision(order.updatedAt);
    setDraft({
      ...work,
      ...next,
      ...(costChange ? { costsReviewed: false } : {}),
    });
    setDirty(true);
    setError("");
    setNotice("");
  }

  function adopt(saved: WorkOrder) {
    setDraft(workFrom(saved));
    setBaseRevision(saved.updatedAt);
    setDirty(false);
  }

  function persist() {
    if (hasConflict)
      throw new Error(
        "This work order changed in another tab. Reload the latest version before saving.",
      );
    const saved = saveWork(order.id, work);
    adopt(saved);
    return saved;
  }

  function save() {
    setError("");
    setBusy(true);
    try {
      persist();
      setNotice("Work order updates saved successfully.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function transition(status: WorkOrderStatus) {
    setError("");
    setBusy(true);
    try {
      if (dirty) persist();
      const saved = setStatus(order.id, status);
      adopt(saved);
      setNotice(`Work order marked ${status.toLowerCase()}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function openCompletion() {
    setError("");
    const pendingTask = order.tasks.find((task) => !work.taskResults[task.id]);
    if (pendingTask) {
      setError(
        `Complete the required task “${pendingTask.title}” before finishing this work order.`,
      );
      setTab("Tasks");
      return;
    }
    for (const item of taskCompleted ? [] : (order.checklist?.items ?? [])) {
      const problem = requiredAnswerError(item, work);
      if (problem) {
        setError(problem);
        setTab("Checklist");
        return;
      }
    }
    try {
      if (dirty) persist();
      setCompletionOpen(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function timeTask(taskId: string, action: "start" | "stop") {
    setError("");
    setBusy(true);
    try {
      if (hasConflict)
        throw new Error(
          "This work order changed in another tab. Reload the latest version before recording time.",
        );
      const saved =
        action === "start"
          ? startTask(order.id, taskId)
          : stopTask(order.id, taskId);
      if (dirty) {
        setDraft({
          ...work,
          taskResults: saved.taskResults,
          taskTimeEntries: saved.taskTimeEntries,
          costsReviewed: false,
        });
        setBaseRevision(saved.updatedAt);
      } else {
        adopt(saved);
      }
      setNotice(
        action === "start"
          ? "Task started. Start time recorded."
          : saved.status === "Completed"
            ? "All tasks completed. Work order marked completed."
            : "Task completed. Stop time recorded.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function edit() {
    setError("");
    try {
      if (dirty) persist();
      setEditing(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function financialTransition(closed: boolean) {
    setError("");
    setBusy(true);
    try {
      if (dirty) persist();
      const saved = setFinancialClosed(order.id, closed);
      adopt(saved);
      setNotice(
        closed
          ? "Financial records closed successfully."
          : "Financial records reopened for updates.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (editing)
    return (
      <WorkOrderEditor
        order={order}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          adopt(saved);
          setEditing(false);
          setNotice(
            saved.status === "Draft"
              ? "Work order draft saved."
              : order.status === "Draft"
                ? "Work order released successfully."
                : "Work order details updated successfully.",
          );
        }}
      />
    );

  return (
    <div className="wod-page">
      <Link href="/tpm/work-orders" className="wod-back">
        <ArrowLeft size={15} /> Work orders
      </Link>
      <header className="wod-header">
        <div>
          <div className="wod-kicker">
            <span>{order.code}</span>
            <span
              className={`wo-badge wod-status-${order.status.toLowerCase().replaceAll(" ", "-")}`}
            >
              {order.status}
            </span>
            {isWorkOrderOverdue(order) && (
              <span className="wo-badge wod-overdue">Overdue</span>
            )}
          </div>
          <h1>{order.title || "Untitled work order"}</h1>
          <div className="wod-asset-line">
            <Factory size={15} />
            {order.assetId ? (
              <Link href={`/tpm/assets/${order.assetId}`}>
                {order.assetName || "Selected asset"}
              </Link>
            ) : (
              <span>Asset not selected</span>
            )}
            {order.assetCode && <span>· {order.assetCode}</span>}
          </div>
        </div>
        {!detailsReadOnly && (
          <div className="wod-actions">
            <button
              type="button"
              className="tpm-button"
              onClick={edit}
              disabled={busy}
            >
              <Pencil size={15} />{" "}
              {isDraft ? "Edit & release draft" : "Edit details"}
            </button>
            {!isDraft &&
              (order.tasks.length > 0 && tasksDone < order.tasks.length ? (
                <button
                  type="button"
                  className="tpm-button primary"
                  onClick={() => setTab("Tasks")}
                  disabled={busy}
                >
                  <Clock3 size={16} />{" "}
                  {order.status === "In progress"
                    ? "View tasks"
                    : "Start tasks"}
                </button>
              ) : order.status !== "In progress" ? (
                <button
                  type="button"
                  className="tpm-button primary"
                  onClick={() => transition("In progress")}
                  disabled={busy}
                >
                  {order.status === "On hold" ? "Resume work" : "Start work"}
                </button>
              ) : (
                <button
                  type="button"
                  className="tpm-button primary"
                  onClick={openCompletion}
                  disabled={busy}
                >
                  <CheckCircle2 size={16} /> Complete work
                </button>
              ))}
          </div>
        )}
      </header>
      {error && (
        <div className="wo-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="wo-success" role="status">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {isDraft && (
        <p className="wod-info">
          This is a draft. Add the remaining details and review it before
          releasing it for maintenance.
        </p>
      )}
      {order.status === "Completed" && (
        <section
          className="wod-financial-banner"
          aria-label="Financial closure"
        >
          <div>
            <strong>
              {order.financialStatus === "Closed"
                ? "Financial records closed"
                : "Maintenance complete · Financial records open"}
            </strong>
            <p>
              {order.financialStatus === "Closed"
                ? `Closed ${date(order.financialClosedAt ?? "")}. Reopen to record a correction.`
                : taskCompleted
                  ? "Task timings are saved. Finish any checklist responses, completion notes, costs and scrap review before closing financial records."
                  : "You can still record final labour, material costs and scrap recovery. Completed tasks and the completion summary are preserved."}
            </p>
            {order.financialStatus === "Open" && financialBlocker && (
              <small>{financialBlocker}</small>
            )}
          </div>
          <div className="wod-actions">
            {taskCompleted && order.financialStatus === "Open" && (
              <button
                type="button"
                className="tpm-button"
                disabled={busy || hasConflict}
                onClick={openCompletion}
              >
                {order.completion
                  ? "Edit completion summary"
                  : "Add completion summary"}
              </button>
            )}
            <button
              type="button"
              className="tpm-button"
              disabled={busy || hasConflict}
              onClick={() =>
                financialTransition(order.financialStatus !== "Closed")
              }
            >
              {order.financialStatus === "Closed"
                ? "Reopen financial records"
                : "Close financial records"}
            </button>
          </div>
        </section>
      )}
      {hasConflict && (
        <div className="wo-error" role="alert">
          <p>
            This work order changed in another tab. Your unsaved changes are
            still shown here. Reload the latest version to continue.
          </p>
          <button
            type="button"
            className="tpm-button"
            onClick={() => {
              if (
                window.confirm(
                  "Discard your unsaved changes and load the latest work order?",
                )
              ) {
                adopt(order);
                setError("");
                setNotice("Latest work order loaded.");
              }
            }}
          >
            Discard changes and reload latest
          </button>
        </div>
      )}
      <section className="wod-facts" aria-label="Work order summary">
        <div>
          <span>Priority</span>
          <strong className={`wod-priority-${order.priority.toLowerCase()}`}>
            {order.priority}
          </strong>
        </div>
        <div>
          <span>Assigned to</span>
          <strong>{order.assigneeName || "Unassigned"}</strong>
        </div>
        <div>
          <span>Due date</span>
          <strong>{date(order.dueAt)}</strong>
        </div>
        <div>
          <span>Maintenance cost</span>
          <strong>
            {work.costsReviewed ? money(totals.gross) : "Pending review"}
          </strong>
        </div>
      </section>
      <div className="wod-tabs" role="tablist" aria-label="Work order sections">
        {TABS.map((name, index) => (
          <button
            type="button"
            role="tab"
            key={name}
            id={`wo-tab-${index}`}
            aria-controls={`wo-panel-${index}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + TABS.length) % TABS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = TABS.length - 1;
              else return;
              event.preventDefault();
              setTab(TABS[next]);
              document.getElementById(`wo-tab-${next}`)?.focus();
            }}
          >
            {name}
            {name === "Checklist" && order.checklist && (
              <span>
                {answered}/{order.checklist.items.length}
              </span>
            )}
            {name === "Tasks" && order.tasks.length > 0 && (
              <span>
                {tasksDone}/{order.tasks.length}
              </span>
            )}
            {name === "Scrap" && work.scrap.length > 0 && (
              <span>{work.scrap.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`wo-panel-${TABS.indexOf(tab)}`}
        aria-labelledby={`wo-tab-${TABS.indexOf(tab)}`}
        tabIndex={0}
        className="wod-content"
      >
        {tab === "Overview" && (
          <div className="wod-overview">
            <div className="wod-stack">
              <section className="wo-panel wod-panel">
                <h2>Work instructions</h2>
                <p className="wod-description">
                  {order.description ||
                    "No additional instructions have been added."}
                </p>
                {order.checklist && (
                  <button
                    type="button"
                    className="wod-checklist-link"
                    onClick={() => setTab("Checklist")}
                  >
                    <ClipboardCheck size={20} />
                    <span>
                      <strong>{order.checklist.name}</strong>
                      <small>
                        {answered} of {order.checklist.items.length} checks
                        answered
                      </small>
                    </span>
                    <span>View checklist →</span>
                  </button>
                )}
                <WorkOrderAttachments
                  value={order.attachments}
                  onChange={() => {}}
                  readOnly
                  label="Attachments"
                />
                {order.documents.length > 0 && (
                  <WorkOrderDocuments
                    value={order.documents}
                    onChange={() => {}}
                    readOnly
                    label="Documents and manuals"
                  />
                )}
              </section>
              <section className="wo-panel wod-panel">
                <h2>Planned resources</h2>
                <p className="wo-muted">
                  Estimates for the planned work. Record actual use in Labour
                  &amp; costs and Materials.
                </p>
                <div className="wod-estimates">
                  <div>
                    <span>Planned labour</span>
                    <strong>
                      {planned.hasEntries
                        ? money(planned.labour)
                        : "Not estimated"}
                    </strong>
                  </div>
                  <div>
                    <span>Planned materials</span>
                    <strong>
                      {planned.hasEntries
                        ? money(planned.materials)
                        : "Not estimated"}
                    </strong>
                  </div>
                  <div>
                    <span>Estimated total</span>
                    <strong>
                      {planned.pending
                        ? "Pending estimate"
                        : planned.hasEntries
                          ? money(planned.total)
                          : "Not estimated"}
                    </strong>
                  </div>
                </div>
                {planned.pending && (
                  <p className="wod-info">
                    Estimate incomplete. Totals include only rows with a
                    quantity or hours and a rate.
                  </p>
                )}
                {order.plannedLabour.length > 0 && (
                  <div className="wod-resource-group">
                    <h3>Labour plan</h3>
                    <ul className="wod-resource-list">
                      {order.plannedLabour.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong>
                              {row.technician || "Technician not set"}
                            </strong>
                            <small>
                              {row.hours || "—"} hours ·{" "}
                              {row.hourlyRate !== ""
                                ? `${money(Number(row.hourlyRate))}/hour`
                                : "Rate pending"}
                            </small>
                          </div>
                          <span>
                            {estimateRowTotal(row.hours, row.hourlyRate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {order.plannedMaterials.length > 0 && (
                  <div className="wod-resource-group">
                    <h3>Materials plan</h3>
                    <ul className="wod-resource-list">
                      {order.plannedMaterials.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong>{row.name || "Material not set"}</strong>
                            <small>
                              {row.quantity || "—"} {row.unit} ·{" "}
                              {row.unitCost !== ""
                                ? `${money(Number(row.unitCost))}/unit`
                                : "Rate pending"}
                            </small>
                          </div>
                          <span>
                            {estimateRowTotal(row.quantity, row.unitCost)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
              {(order.safetyTags.length > 0 ||
                order.permitRequired ||
                order.safetyNotes) && (
                <section className="wo-panel wod-panel">
                  <h2>
                    <ShieldCheck size={18} /> Safety and permits
                  </h2>
                  {order.safetyTags.length > 0 && (
                    <div className="wod-safety-tags">
                      {order.safetyTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <dl className="wod-detail-grid">
                    <div>
                      <dt>Permit required</dt>
                      <dd>{order.permitRequired ? "Yes" : "No"}</dd>
                    </div>
                    {order.permitRequired && (
                      <div>
                        <dt>Permit reference</dt>
                        <dd>{order.permitReference || "Not recorded"}</dd>
                      </div>
                    )}
                  </dl>
                  {order.safetyNotes && (
                    <p className="wod-description">{order.safetyNotes}</p>
                  )}
                </section>
              )}
              {taskCompleted && !order.completion && (
                <section className="wo-panel wod-panel">
                  <h2>
                    <CheckCircle2 size={18} /> Maintenance completed
                  </h2>
                  <p>
                    All {order.tasks.length} tasks were completed on{" "}
                    {formatTaskTimestamp(order.completedAt!)}.
                  </p>
                  <p className="wo-muted">
                    Total task time:{" "}
                    {formatWorkOrderDuration(
                      totalTaskDurationSeconds(order.taskTimeEntries),
                    )}{" "}
                    (HH:MM:SS). Add completion notes and confirm scrap generated
                    before financial closure.
                  </p>
                </section>
              )}
              {order.completion && (
                <section className="wo-panel wod-panel">
                  <h2>
                    <CheckCircle2 size={18} /> Completion summary
                  </h2>
                  <p className="wod-description">{order.completion.notes}</p>
                  <dl className="wod-detail-grid">
                    <div>
                      <dt>Completed on</dt>
                      <dd>{date(order.completedAt ?? "")}</dd>
                    </div>
                    <div>
                      <dt>Actual time spent</dt>
                      <dd>
                        {taskCompleted
                          ? formatWorkOrderDuration(
                              totalTaskDurationSeconds(order.taskTimeEntries),
                            )
                          : order.completion.actualHours
                            ? formatWorkOrderDuration(
                                Number(order.completion.actualHours) * 3600,
                              )
                            : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt>Scrap declared at completion</dt>
                      <dd>{order.completion.scrapGenerated}</dd>
                    </div>
                  </dl>
                  <p className="wo-muted">
                    This summary records the maintenance completion. Current
                    scrap records and later recovery updates are available in
                    the Scrap tab.
                  </p>
                  <WorkOrderAttachments
                    value={order.completion.attachments}
                    onChange={() => {}}
                    readOnly
                    label="Completion photos"
                  />
                </section>
              )}
              {!operationalReadOnly && (
                <section className="wo-panel wod-panel">
                  <h2>Manage progress</h2>
                  <p className="wo-muted">
                    Keep your team informed as the work moves forward.
                  </p>
                  <div className="wod-actions">
                    {order.status !== "On hold" && (
                      <button
                        type="button"
                        className="tpm-button"
                        disabled={busy}
                        onClick={() => transition("On hold")}
                      >
                        Put on hold
                      </button>
                    )}
                    <button
                      type="button"
                      className="tpm-button wod-danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Cancel this work order? Its recorded work will be retained and it will become read-only.",
                          )
                        )
                          transition("Cancelled");
                      }}
                    >
                      Cancel work order
                    </button>
                  </div>
                </section>
              )}
            </div>
            <aside className="wo-panel wod-panel">
              <h2>Planning</h2>
              <dl className="wod-planning">
                <div>
                  <dt>Maintenance type</dt>
                  <dd>{order.type}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{order.departmentName || "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Maintenance team</dt>
                  <dd>{order.team || "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Estimated duration</dt>
                  <dd>
                    {order.estimatedDuration
                      ? `${order.estimatedDuration} hours`
                      : "Not estimated"}
                  </dd>
                </div>
                <div>
                  <dt>Planned start</dt>
                  <dd>{date(order.plannedStart)}</dd>
                </div>
                <div>
                  <dt>Estimated budget</dt>
                  <dd>
                    {order.estimatedBudget !== ""
                      ? money(Number(order.estimatedBudget))
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Asset location</dt>
                  <dd>{order.assetLocation || "Not specified"}</dd>
                </div>
                <div>
                  <dt>Created by</dt>
                  <dd>{order.createdBy}</dd>
                </div>
                <div>
                  <dt>Created on</dt>
                  <dd>{date(order.createdAt)}</dd>
                </div>
              </dl>
            </aside>
          </div>
        )}
        {tab === "Tasks" && (
          <WorkOrderTaskTimers
            order={order}
            busy={busy || hasConflict}
            onStart={(taskId) => timeTask(taskId, "start")}
            onStop={(taskId) => timeTask(taskId, "stop")}
          />
        )}
        {tab === "Checklist" && (
          <section className="wo-panel wod-panel">
            <div className="wod-section-heading">
              <div>
                <h2>{order.checklist?.name ?? "Inspection checklist"}</h2>
                <p className="wo-muted">
                  Record the checks carried out during this work.
                </p>
              </div>
              {order.checklist && (
                <span className="wo-badge">
                  {answered}/{order.checklist.items.length} answered
                </span>
              )}
            </div>
            {!order.checklist ? (
              <div className="wo-empty">
                <ClipboardCheck size={28} />
                <h3>No checklist attached</h3>
                <p>
                  {checklistReadOnly
                    ? "This work order did not include a checklist."
                    : "Use Edit details to attach a published inspection checklist."}
                </p>
              </div>
            ) : (
              <div className="wod-checks">
                {order.checklist.items.map((item, index) => {
                  const answer = work.answers[item.id] ?? {
                    value: "",
                    note: "",
                  };
                  const updateAnswer = (value: Partial<typeof answer>) =>
                    change(
                      {
                        answers: {
                          ...work.answers,
                          [item.id]: { ...answer, ...value },
                        },
                      },
                      false,
                    );
                  const issue = inspectionItemHasIssue(item, answer);
                  return (
                    <section className="wod-check" key={item.id}>
                      <div className="wod-check-title">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <small>{item.section}</small>
                          <h3>
                            {item.title}
                            {item.required && (
                              <span className="wod-required"> *</span>
                            )}
                          </h3>
                          {item.instructions && <p>{item.instructions}</p>}
                        </div>
                      </div>
                      <div className="wod-check-response">
                        {item.responseType === "Pass / Fail" ? (
                          <Field label={`Response for ${item.title}`}>
                            <select
                              value={answer.value}
                              disabled={checklistReadOnly}
                              onChange={(event) =>
                                updateAnswer({ value: event.target.value })
                              }
                            >
                              <option value="">Choose a response</option>
                              <option value="Pass">Pass</option>
                              <option value="Fail">Fail</option>
                              {item.allowNa && <option value="NA">N/A</option>}
                            </select>
                          </Field>
                        ) : (
                          <>
                            <Field
                              label={
                                item.responseType === "Number"
                                  ? `Reading${item.unit ? ` (${item.unit})` : ""} for ${item.title}`
                                  : `Response for ${item.title}`
                              }
                            >
                              {item.responseType === "Number" ? (
                                <input
                                  type="number"
                                  step="any"
                                  disabled={
                                    checklistReadOnly || answer.value === "NA"
                                  }
                                  value={
                                    answer.value === "NA" ? "" : answer.value
                                  }
                                  onChange={(event) =>
                                    updateAnswer({ value: event.target.value })
                                  }
                                />
                              ) : (
                                <textarea
                                  rows={2}
                                  maxLength={4000}
                                  disabled={
                                    checklistReadOnly || answer.value === "NA"
                                  }
                                  value={
                                    answer.value === "NA" ? "" : answer.value
                                  }
                                  onChange={(event) =>
                                    updateAnswer({ value: event.target.value })
                                  }
                                />
                              )}
                            </Field>
                            {item.responseType === "Number" &&
                              (item.min || item.max) && (
                                <p className="wod-range">
                                  Expected range: {item.min || "No minimum"} to{" "}
                                  {item.max || "No maximum"} {item.unit}
                                </p>
                              )}
                            {item.allowNa && (
                              <label className="wod-checkbox">
                                <input
                                  type="checkbox"
                                  disabled={checklistReadOnly}
                                  checked={answer.value === "NA"}
                                  onChange={(event) =>
                                    updateAnswer({
                                      value: event.target.checked ? "NA" : "",
                                    })
                                  }
                                />{" "}
                                Not applicable
                              </label>
                            )}
                          </>
                        )}
                        {issue && (
                          <p className="wod-issue">
                            Issue identified. Add a note before completing the
                            work order.
                          </p>
                        )}
                        <Field
                          label={`Notes for ${item.title}${issue ? " *" : " (optional)"}`}
                        >
                          <textarea
                            rows={2}
                            maxLength={4000}
                            disabled={checklistReadOnly}
                            value={answer.note}
                            onChange={(event) =>
                              updateAnswer({ note: event.target.value })
                            }
                            placeholder="Observations or action taken"
                          />
                        </Field>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {tab === "Labour & costs" && (
          <LabourCostsPanel
            order={order}
            work={work}
            readOnly={readOnly}
            change={change}
          />
        )}
        {tab === "Materials" && (
          <section className="wo-panel wod-panel">
            <div className="wod-section-heading">
              <div>
                <h2>Materials consumed</h2>
                <p className="wo-muted">
                  Record the spare parts and supplies used for this work.
                </p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className="tpm-button"
                  onClick={() =>
                    change({
                      materials: [
                        ...work.materials,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          quantity: 1,
                          unit: "pcs",
                          unitCost: 0,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} /> Add material
                </button>
              )}
            </div>
            {work.materials.length === 0 ? (
              <EmptyRows text="No materials recorded." />
            ) : (
              work.materials.map((row, index) => (
                <div className="wod-entry" key={row.id}>
                  <div className="wod-entry-title">
                    <strong>Material {index + 1}</strong>
                    <RowRemove
                      label={`Remove material ${index + 1}`}
                      disabled={readOnly}
                      onClick={() =>
                        change({
                          materials: work.materials.filter(
                            (item) => item.id !== row.id,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="wod-row-grid wod-material-grid">
                    <Field label="Material / spare part *">
                      <input
                        aria-label={`Material name ${index + 1}`}
                        maxLength={200}
                        disabled={readOnly}
                        value={row.name}
                        onChange={(event) =>
                          change({
                            materials: work.materials.map((item) =>
                              item.id === row.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Quantity *">
                      <input
                        aria-label={`Material quantity ${index + 1}`}
                        type="number"
                        step="any"
                        min="0.01"
                        disabled={readOnly}
                        value={inputNumber(row.quantity)}
                        onChange={(event) =>
                          change({
                            materials: work.materials.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    quantity: amount(event.target.value),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Unit *">
                      <input
                        aria-label={`Material unit ${index + 1}`}
                        maxLength={40}
                        disabled={readOnly}
                        value={row.unit}
                        onChange={(event) =>
                          change({
                            materials: work.materials.map((item) =>
                              item.id === row.id
                                ? { ...item, unit: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Unit cost (₹) *">
                      <input
                        aria-label={`Material unit cost ${index + 1}`}
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={readOnly}
                        value={inputNumber(row.unitCost)}
                        onChange={(event) =>
                          change({
                            materials: work.materials.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    unitCost: amount(event.target.value),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <RowTotal value={row.quantity * row.unitCost} />
                  </div>
                </div>
              ))
            )}
          </section>
        )}
        {tab === "Scrap" && (
          <ScrapPanel
            order={order}
            work={work}
            readOnly={readOnly}
            change={change}
          />
        )}
        {tab === "Activity" && (
          <section className="wo-panel wod-panel">
            <h2>Activity</h2>
            <ol className="wod-timeline">
              {[...order.history].reverse().map((item) => (
                <li key={item.id}>
                  <span className="wod-timeline-dot">
                    <Clock3 size={14} />
                  </span>
                  <div>
                    <p>{item.message}</p>
                    <time dateTime={item.at}>{date(item.at)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {!readOnly && (
        <div className="wod-savebar">
          <span>
            {dirty ? "You have unsaved changes" : "All changes saved"}
          </span>
          <button
            type="button"
            className="tpm-button primary"
            disabled={!dirty || busy}
            onClick={save}
          >
            <Save size={15} /> Save changes
          </button>
        </div>
      )}
      {completionOpen && (
        <CompletionDialog
          order={order}
          closeout={taskCompleted}
          onClose={() => setCompletionOpen(false)}
          onComplete={(completion) => {
            const saved = taskCompleted
              ? saveCompletion(order.id, completion)
              : complete(order.id, completion);
            adopt(saved);
            setNotice(
              taskCompleted
                ? "Completion summary saved successfully."
                : "Work order completed successfully.",
            );
            setCompletionOpen(false);
            setTab("Overview");
          }}
        />
      )}
    </div>
  );
}

function safeMoney(value: number) {
  return Number.isFinite(value) ? money(value) : "—";
}
function estimateRowTotal(quantity: string, rate: string) {
  return quantity.trim() &&
    rate.trim() &&
    Number.isFinite(Number(quantity)) &&
    Number.isFinite(Number(rate))
    ? money(Number(quantity) * Number(rate))
    : "Estimate pending";
}
function RowTotal({ value }: { value: number }) {
  return (
    <div className="wod-row-total">
      <span>Total</span>
      <strong>{safeMoney(value)}</strong>
    </div>
  );
}
function RowRemove({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return disabled ? null : (
    <button
      type="button"
      className="wod-remove"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 size={16} />
    </button>
  );
}
function EmptyRows({ text }: { text: string }) {
  return <div className="wod-no-rows">{text}</div>;
}

function CompletionDialog({
  order,
  closeout = false,
  onClose,
  onComplete,
}: {
  order: WorkOrder;
  closeout?: boolean;
  onClose: () => void;
  onComplete: (value: WorkOrderCompletion) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openedRevision] = useState(order.updatedAt);
  const hasConflict = openedRevision !== order.updatedAt;
  const [value, setValue] = useState<WorkOrderCompletion>(() => ({
    notes: order.completion?.notes ?? "",
    actualHours: closeout
      ? String(totalTaskDurationSeconds(order.taskTimeEntries) / 3600)
      : "",
    scrapGenerated: order.completion?.scrapGenerated ?? "",
    attachments: order.completion?.attachments ?? [],
  }));
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="wod-dialog"
      aria-labelledby="wo-complete-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
          ),
        );
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (hasConflict) {
            setError(
              "This work order changed in another tab. Close this dialog and reopen the latest completion summary.",
            );
            return;
          }
          if (!value.notes.trim()) {
            setError("Describe the work completed.");
            return;
          }
          if (
            !closeout &&
            value.actualHours !== "" &&
            (!Number.isFinite(Number(value.actualHours)) ||
              Number(value.actualHours) <= 0)
          ) {
            setError("Enter a positive number of hours, or leave it blank.");
            return;
          }
          if (!value.scrapGenerated) {
            setError("Confirm whether this work generated scrap.");
            return;
          }
          if (value.scrapGenerated === "Yes" && !order.scrap.length) {
            setError(
              "Add at least one scrap item in the Scrap section before completing.",
            );
            return;
          }
          if (value.scrapGenerated === "No" && order.scrap.length) {
            setError(
              "Scrap items have been recorded. Select Yes, or update the Scrap section.",
            );
            return;
          }
          try {
            onComplete(value);
          } catch (cause) {
            setError(errorMessage(cause));
          }
        }}
      >
        <header>
          <div>
            <span className="wod-dialog-icon">
              <CheckCircle2 size={23} />
            </span>
            <h2 id="wo-complete-title">
              {closeout ? "Completion summary" : "Complete work order"}
            </h2>
            <p>
              {order.code} · {order.title}
            </p>
          </div>
          <button
            type="button"
            className="wod-remove"
            aria-label="Close completion dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="wod-dialog-body">
          {hasConflict && (
            <p className="wo-error" role="alert">
              This work order changed while the dialog was open. Close it and
              reopen the latest completion summary.
            </p>
          )}
          {error && (
            <p className="wo-error" role="alert">
              {error}
            </p>
          )}
          <Field label="Completion notes *">
            <textarea
              autoFocus
              rows={4}
              required
              maxLength={4000}
              value={value.notes}
              onChange={(event) =>
                setValue({ ...value, notes: event.target.value })
              }
              placeholder="What was repaired, replaced or inspected?"
            />
          </Field>
          {closeout ? (
            <Field label="Recorded task time (HH:MM:SS)">
              <input
                readOnly
                value={formatWorkOrderDuration(
                  totalTaskDurationSeconds(order.taskTimeEntries),
                )}
              />
            </Field>
          ) : (
            <Field label="Actual time spent (hours, optional)">
              <input
                type="number"
                min="0.01"
                step="any"
                value={value.actualHours}
                onChange={(event) =>
                  setValue({ ...value, actualHours: event.target.value })
                }
              />
            </Field>
          )}
          <Field label="Scrap generated? *">
            <select
              required
              value={value.scrapGenerated}
              onChange={(event) =>
                setValue({
                  ...value,
                  scrapGenerated: event.target
                    .value as WorkOrderCompletion["scrapGenerated"],
                })
              }
            >
              <option value="">Choose Yes or No</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          <p className="wo-muted">
            {order.scrap.length
              ? `${order.scrap.length} scrap item(s) recorded.`
              : "No scrap items recorded. Add items in the Scrap section if needed."}
          </p>
          <WorkOrderAttachments
            label="Completion photos"
            value={value.attachments}
            onChange={(attachments) => setValue({ ...value, attachments })}
          />
          {!order.costsReviewed && (
            <p className="wod-info">
              Costing is pending review. This will remain visible after
              completion.
            </p>
          )}
          <p className="wo-muted">
            Costs and scrap records remain editable until financial records are
            closed.
          </p>
        </div>
        <footer>
          <button type="button" className="tpm-button" onClick={onClose}>
            Back to work order
          </button>
          <button
            type="submit"
            className="tpm-button primary"
            disabled={hasConflict}
          >
            <Check size={16} />{" "}
            {closeout ? "Save completion summary" : "Complete work order"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
