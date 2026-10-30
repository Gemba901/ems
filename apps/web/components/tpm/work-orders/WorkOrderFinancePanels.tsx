"use client";

import { useState, type ReactNode } from "react";
import { Clock3, Plus, ReceiptText, Recycle, Trash2 } from "lucide-react";
import { WorkOrderAttachments } from "./WorkOrderAttachments";
import { WorkOrderDocuments } from "./WorkOrderDocuments";
import { scrapReviewDetailsChanged } from "./work-order-preview";
import {
  SCRAP_DISPOSITIONS,
  formatWorkOrderDuration,
  formatWorkOrderMoney as money,
  plannedWorkOrderTotals,
  taskDurationSeconds,
  workOrderTotals,
  type LabourEntry,
  type ScrapEntry,
  type WorkOrder,
  type WorkOrderWork,
} from "./work-order-types";
import "./work-order-finance.css";

type FinancePanelProps = {
  order: WorkOrder;
  work: WorkOrderWork;
  readOnly: boolean;
  change: (next: Partial<WorkOrderWork>, costChange?: boolean) => void;
};

const EXPENSE_CATEGORIES = [
  "External service",
  "Transport",
  "Equipment hire",
  "Consumables",
  "Other",
];
const amount = (value: string) => (value === "" ? Number.NaN : Number(value));
const optionalAmount = (value: string) => (value === "" ? null : Number(value));
const inputNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : "";
const safeMoney = (value: number) =>
  Number.isFinite(value) ? money(value) : "—";

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

function RemoveRow({
  label,
  readOnly,
  onClick,
}: {
  label: string;
  readOnly: boolean;
  onClick: () => void;
}) {
  return readOnly ? null : (
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

export function LabourCostsPanel({
  order,
  work,
  readOnly,
  change,
}: FinancePanelProps) {
  const [selectedTask, setSelectedTask] = useState("");
  const totals = workOrderTotals(work);
  const planned = plannedWorkOrderTotals(order);
  const plannedLabour = plannedWorkOrderTotals({
    plannedLabour: order.plannedLabour,
    plannedMaterials: [],
  });
  const plannedMaterials = plannedWorkOrderTotals({
    plannedLabour: [],
    plannedMaterials: order.plannedMaterials,
  });
  const timers = work.taskTimeEntries ?? {};
  const availableTasks = order.tasks.filter(
    (task) =>
      work.taskResults[task.id] &&
      timers[task.id]?.stoppedAt &&
      taskDurationSeconds(timers[task.id]) > 0 &&
      !work.labour.some((row) => row.taskId === task.id),
  );
  const selectedAvailableTask = availableTasks.find(
    (task) => task.id === selectedTask,
  );
  const selectedTimer = selectedAvailableTask
    ? timers[selectedAvailableTask.id]
    : undefined;
  const budget = order.estimatedBudget.trim()
    ? Number(order.estimatedBudget)
    : null;
  const hasBudget = budget !== null && Number.isFinite(budget);

  function addTimerLabour() {
    if (readOnly || !selectedAvailableTask || !selectedTimer?.stoppedAt) return;
    const plannedRate = order.plannedLabour.find(
      (row) =>
        row.technician.trim().toLowerCase() ===
        selectedTimer.performedByName.trim().toLowerCase(),
    )?.hourlyRate;
    change({
      labour: [
        ...work.labour,
        {
          id: crypto.randomUUID(),
          taskId: selectedAvailableTask.id,
          technician: selectedTimer.performedByName,
          hours: taskDurationSeconds(selectedTimer) / 3600,
          hourlyRate:
            plannedRate && Number.isFinite(Number(plannedRate))
              ? Number(plannedRate)
              : 0,
        },
      ],
    });
    setSelectedTask("");
  }

  return (
    <div className="wod-stack wod-finance">
      <section className="wo-panel wod-panel">
        <div className="wod-section-heading">
          <div>
            <h2>
              <ReceiptText size={17} /> Cost overview
            </h2>
            <p className="wo-muted">
              Review the recorded cost of this work order. All amounts are in
              INR.
            </p>
          </div>
          <span
            className={`wo-badge${work.costsReviewed ? " wod-status-completed" : ""}`}
          >
            {work.costsReviewed ? "Reviewed" : "Pending review"}
          </span>
        </div>
        <div className="wod-finance-metrics">
          <div>
            <span>Estimated budget</span>
            <strong>{hasBudget ? money(budget) : "Not set"}</strong>
          </div>
          <div>
            <span>Actual gross cost</span>
            <strong>{safeMoney(totals.gross)}</strong>
          </div>
          <div>
            <span>Actual recovery</span>
            <strong>{safeMoney(totals.recovery)}</strong>
          </div>
          <div className="wod-finance-net">
            <span>Net actual cost</span>
            <strong>{safeMoney(totals.net)}</strong>
          </div>
        </div>
        {hasBudget && Number.isFinite(totals.gross) && (
          <p
            className={`wod-budget-note${totals.gross > budget ? " is-over" : ""}`}
          >
            {totals.gross > budget
              ? `${money(totals.gross - budget)} above the estimated budget before recovery.`
              : `${money(budget - totals.gross)} remaining against the estimated budget before recovery.`}
          </p>
        )}
      </section>

      <section className="wo-panel wod-panel">
        <div className="wod-section-heading">
          <div>
            <h2>Labour entries</h2>
            <p className="wo-muted">
              Use completed task timers or add hours worked manually.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              className="tpm-button"
              onClick={() =>
                change({
                  labour: [
                    ...work.labour,
                    {
                      id: crypto.randomUUID(),
                      technician: "",
                      hours: 1,
                      hourlyRate: 0,
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> Add manual labour
            </button>
          )}
        </div>

        {availableTasks.length > 0 && (
          <p className="wod-info">
            {availableTasks.length} completed{" "}
            {availableTasks.length === 1 ? "task has" : "tasks have"} recorded
            time waiting to be costed.{" "}
            {readOnly
              ? "This time is not included in the recorded labour cost."
              : "Add a labour entry and hourly rate to include that time in actual costs."}
          </p>
        )}

        {!readOnly && (
          <div className="wod-timer-costing">
            <div className="wod-timer-costing-title">
              <Clock3 size={16} />
              <strong>Add from a completed task</strong>
            </div>
            <div className="wod-timer-picker">
              <Field label="Completed task timer">
                <select
                  value={selectedAvailableTask?.id ?? ""}
                  disabled={!availableTasks.length}
                  onChange={(event) => setSelectedTask(event.target.value)}
                >
                  <option value="">
                    {availableTasks.length
                      ? "Choose a task"
                      : "No uncosted completed task timers"}
                  </option>
                  {availableTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title} ·{" "}
                      {formatWorkOrderDuration(
                        taskDurationSeconds(timers[task.id]),
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="tpm-button"
                disabled={!selectedAvailableTask}
                onClick={addTimerLabour}
              >
                <Plus size={15} /> Add timed labour
              </button>
            </div>
            <p className="wo-help">
              {selectedTimer
                ? `${selectedTimer.performedByName} · ${formatWorkOrderDuration(taskDurationSeconds(selectedTimer))} recorded. Set the hourly rate after adding.`
                : "Each task timer can be linked once. Add manual labour only for time that is not already covered by a timer entry."}
            </p>
          </div>
        )}

        {!work.labour.length ? (
          <div className="wod-no-rows">No labour entries recorded.</div>
        ) : (
          work.labour.map((row, index) => {
            const timer = row.taskId ? timers[row.taskId] : undefined;
            const linkedTask = row.taskId
              ? order.tasks.find((task) => task.id === row.taskId)
              : undefined;
            const hours = timer?.stoppedAt
              ? taskDurationSeconds(timer) / 3600
              : row.hours;
            const update = (patch: Partial<LabourEntry>) =>
              change({
                labour: work.labour.map((item) =>
                  item.id === row.id ? { ...item, ...patch } : item,
                ),
              });
            return (
              <div className="wod-entry" key={row.id}>
                <div className="wod-entry-title">
                  <div className="wod-finance-entry-label">
                    <strong>Labour entry {index + 1}</strong>
                    <span
                      className={`wod-entry-source${row.taskId ? " is-timed" : ""}`}
                    >
                      {row.taskId ? (
                        <>
                          <Clock3 size={12} /> Task timer
                        </>
                      ) : (
                        "Manual"
                      )}
                    </span>
                  </div>
                  <RemoveRow
                    label={`Remove labour ${index + 1}`}
                    readOnly={readOnly}
                    onClick={() =>
                      change({
                        labour: work.labour.filter(
                          (item) => item.id !== row.id,
                        ),
                      })
                    }
                  />
                </div>
                {row.taskId && (
                  <p className="wod-linked-task">
                    {linkedTask?.title ?? "Linked task"}
                  </p>
                )}
                <div className="wod-row-grid">
                  <Field label="Technician *">
                    <input
                      aria-label={`Technician ${index + 1}`}
                      maxLength={200}
                      disabled={readOnly}
                      readOnly={!!row.taskId}
                      value={timer?.performedByName ?? row.technician}
                      onChange={(event) =>
                        update({ technician: event.target.value })
                      }
                    />
                  </Field>
                  {row.taskId ? (
                    <Field label="Recorded time (HH:MM:SS)">
                      <input
                        aria-label={`Recorded time ${index + 1}`}
                        className="wod-duration-value"
                        readOnly
                        value={formatWorkOrderDuration(hours * 3600)}
                      />
                    </Field>
                  ) : (
                    <Field label="Hours worked *">
                      <input
                        aria-label={`Hours worked ${index + 1}`}
                        type="number"
                        step="any"
                        min="0.01"
                        disabled={readOnly}
                        value={inputNumber(row.hours)}
                        onChange={(event) =>
                          update({ hours: amount(event.target.value) })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Hourly rate (₹) *">
                    <input
                      aria-label={`Hourly rate ${index + 1}`}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={readOnly}
                      value={inputNumber(row.hourlyRate)}
                      onChange={(event) =>
                        update({ hourlyRate: amount(event.target.value) })
                      }
                    />
                  </Field>
                  <div className="wod-row-total">
                    <span>Total</span>
                    <strong>{safeMoney(hours * row.hourlyRate)}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="wo-panel wod-panel">
        <div className="wod-section-heading">
          <div>
            <h2>Other expenses</h2>
            <p className="wo-muted">
              Record additional charges and attach receipts or invoices.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              className="tpm-button"
              onClick={() =>
                change({
                  expenses: [
                    ...work.expenses,
                    {
                      id: crypto.randomUUID(),
                      description: "",
                      amount: 0,
                      category: "Other",
                      attachments: [],
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> Add expense
            </button>
          )}
        </div>
        {!work.expenses.length ? (
          <div className="wod-no-rows">No other expenses recorded.</div>
        ) : (
          work.expenses.map((row, index) => {
            const update = (patch: Partial<typeof row>) =>
              change({
                expenses: work.expenses.map((item) =>
                  item.id === row.id ? { ...item, ...patch } : item,
                ),
              });
            return (
              <div className="wod-entry" key={row.id}>
                <div className="wod-entry-title">
                  <strong>Expense {index + 1}</strong>
                  <RemoveRow
                    label={`Remove expense ${index + 1}`}
                    readOnly={readOnly}
                    onClick={() =>
                      change({
                        expenses: work.expenses.filter(
                          (item) => item.id !== row.id,
                        ),
                      })
                    }
                  />
                </div>
                <div className="wod-finance-expense-grid">
                  <Field label="Description *">
                    <input
                      aria-label={`Expense description ${index + 1}`}
                      maxLength={200}
                      disabled={readOnly}
                      value={row.description}
                      onChange={(event) =>
                        update({ description: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      aria-label={`Expense category ${index + 1}`}
                      disabled={readOnly}
                      value={row.category ?? ""}
                      onChange={(event) =>
                        update({ category: event.target.value })
                      }
                    >
                      <option value="">Uncategorised</option>
                      {row.category &&
                        !EXPENSE_CATEGORIES.includes(row.category) && (
                          <option>{row.category}</option>
                        )}
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Amount (₹) *">
                    <input
                      aria-label={`Expense amount ${index + 1}`}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={readOnly}
                      value={inputNumber(row.amount)}
                      onChange={(event) =>
                        update({ amount: amount(event.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="wod-finance-attachments">
                  <WorkOrderDocuments
                    label={`Receipt photos & documents ${index + 1}`}
                    helpText="Attach receipts or invoices. PDF, PNG, JPG or WebP · Up to 5 files · 1 MB each, 3 MB total."
                    value={row.attachments ?? []}
                    readOnly={readOnly}
                    onChange={(attachments) => update({ attachments })}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="wo-panel wod-panel">
        <div className="wod-section-heading">
          <div>
            <h2>Estimate vs actual</h2>
            <p className="wo-muted">
              Compare planned resources with recorded costs.
            </p>
          </div>
        </div>
        <div className="wod-finance-table-wrap">
          <table className="wod-finance-table">
            <caption className="sr-only">
              Estimated and actual work order costs in INR
            </caption>
            <thead>
              <tr>
                <th scope="col">Cost category</th>
                <th scope="col">Estimate</th>
                <th scope="col">Actual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Labour</th>
                <td>
                  {order.plannedLabour.length
                    ? plannedLabour.pending
                      ? "Estimate pending"
                      : money(planned.labour)
                    : "Not estimated"}
                </td>
                <td>{safeMoney(totals.labour)}</td>
              </tr>
              <tr>
                <th scope="row">Materials</th>
                <td>
                  {order.plannedMaterials.length
                    ? plannedMaterials.pending
                      ? "Estimate pending"
                      : money(planned.materials)
                    : "Not estimated"}
                </td>
                <td>{safeMoney(totals.materials)}</td>
              </tr>
              <tr>
                <th scope="row">Other expenses</th>
                <td>—</td>
                <td>{safeMoney(totals.other)}</td>
              </tr>
              <tr>
                <th scope="row">Scrap disposal costs</th>
                <td>—</td>
                <td>{safeMoney(totals.disposal)}</td>
              </tr>
              <tr className="wod-finance-table-total">
                <th scope="row">Gross cost</th>
                <td>
                  {planned.pending
                    ? "Estimate pending"
                    : planned.hasEntries
                      ? money(planned.total)
                      : "Not estimated"}
                </td>
                <td>{safeMoney(totals.gross)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="wo-help">
          The resource estimate includes planned labour and materials. Other
          expenses and disposal costs are added to the actual gross cost.
        </p>
        <div className="wod-cost-summary">
          <div>
            <span>Less: actual scrap recovery</span>
            <strong>{safeMoney(totals.recovery)}</strong>
          </div>
          <div className="wod-cost-total">
            <span>Net cost after actual recovery</span>
            <strong>{safeMoney(totals.net)}</strong>
          </div>
        </div>
        <p className="wo-help">
          Estimated scrap value is for planning; only actual recovery reduces
          net cost. Financial review is separate from completing the maintenance
          work.
        </p>
        {!readOnly && (
          <label className="wod-checkbox wod-review">
            <input
              type="checkbox"
              checked={work.costsReviewed}
              onChange={(event) =>
                change({ costsReviewed: event.target.checked }, false)
              }
            />
            <span>
              I have reviewed all recorded costs and actual recovery.
              <small>
                Include labour, materials, other expenses and disposal costs.
                Further changes require another review.
              </small>
            </span>
          </label>
        )}
      </section>
    </div>
  );
}

export function ScrapPanel({
  order,
  work,
  readOnly,
  change,
}: FinancePanelProps) {
  const totals = workOrderTotals(work);
  const estimatedValue = work.scrap.reduce(
    (total, row) => total + (row.estimatedValue ?? 0),
    0,
  );
  const pendingApprovals = work.scrap.filter(
    (row) => row.approvalRequired && row.approvalStatus !== "Approved",
  ).length;
  return (
    <section className="wo-panel wod-panel wod-finance">
      <div className="wod-section-heading">
        <div>
          <h2>
            <Recycle size={17} /> Scrap register
          </h2>
          <p className="wo-muted">
            Track removed items, disposition, disposal costs and recovery.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="tpm-button"
            onClick={() =>
              change({
                scrap: [
                  ...work.scrap,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    quantity: 1,
                    unit: "pcs",
                    reason: "",
                    rootCause: "",
                    location: "",
                    disposition: "Awaiting review",
                    estimatedValue: null,
                    actualRecovery: null,
                    disposalCost: 0,
                    dispositionDate: "",
                    approvalRequired: true,
                    approvalStatus: "Pending",
                    approvalBy: "",
                    approvalAt: null,
                    attachments: [],
                  },
                ],
              })
            }
          >
            <Plus size={15} /> Add scrap item
          </button>
        )}
      </div>
      {!!work.scrap.length && (
        <div className="wod-finance-metrics">
          <div>
            <span>Estimated scrap value</span>
            <strong>
              {work.scrap.some((row) => row.estimatedValue !== null)
                ? safeMoney(estimatedValue)
                : "Not estimated"}
            </strong>
          </div>
          <div>
            <span>Actual recovery</span>
            <strong>
              {work.scrap.some((row) => row.actualRecovery !== null)
                ? safeMoney(totals.recovery)
                : "Not recorded"}
            </strong>
          </div>
          <div>
            <span>Disposal costs</span>
            <strong>{safeMoney(totals.disposal)}</strong>
          </div>
          <div>
            <span>Awaiting approval</span>
            <strong>
              {pendingApprovals} {pendingApprovals === 1 ? "item" : "items"}
            </strong>
          </div>
        </div>
      )}
      <p className="wod-info">
        Actual recovery reduces net work order cost. Disposal costs increase it.
        Estimated value is kept for planning.
        {order.status === "Completed" &&
          " Financial updates remain available until financial closure."}
      </p>
      {!work.scrap.length ? (
        <div className="wod-no-rows">No scrap items recorded.</div>
      ) : (
        work.scrap.map((row, index) => {
          const savedRow = order.scrap.find((item) => item.id === row.id);
          const revisedReview =
            !!savedRow &&
            (savedRow.approvalStatus ?? "Pending") !== "Pending" &&
            scrapReviewDetailsChanged(savedRow, row);
          const update = (patch: Partial<ScrapEntry>) => {
            const resetReview =
              (patch.approvalStatus === undefined &&
                (row.approvalStatus ?? "Pending") !== "Pending") ||
              patch.approvalStatus === "Pending";
            change({
              scrap: work.scrap.map((item) =>
                item.id === row.id
                  ? {
                      ...item,
                      ...patch,
                      ...(resetReview
                        ? {
                            approvalStatus: "Pending" as const,
                            approvalBy: "",
                            approvalAt: null,
                          }
                        : {}),
                    }
                  : item,
              ),
            });
          };
          const approvalStatus = revisedReview
            ? "Pending"
            : (row.approvalStatus ?? "Pending");
          const decisionSaved =
            !revisedReview &&
            savedRow?.approvalStatus === approvalStatus &&
            savedRow.approvalBy === row.approvalBy &&
            savedRow.approvalAt === row.approvalAt;
          return (
            <div className="wod-entry" key={row.id}>
              <div className="wod-entry-title">
                <div className="wod-finance-entry-label">
                  <strong>Scrap item {index + 1}</strong>
                  <span className="wod-entry-source">{row.disposition}</span>
                </div>
                <RemoveRow
                  label={`Remove scrap ${index + 1}`}
                  readOnly={readOnly}
                  onClick={() =>
                    change({
                      scrap: work.scrap.filter((item) => item.id !== row.id),
                    })
                  }
                />
              </div>
              <div className="wod-row-grid wod-scrap-grid">
                <Field label="Item name *">
                  <input
                    aria-label={`Scrap item name ${index + 1}`}
                    maxLength={200}
                    disabled={readOnly}
                    value={row.name}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </Field>
                <Field label="Quantity *">
                  <input
                    aria-label={`Scrap quantity ${index + 1}`}
                    type="number"
                    step="any"
                    min="0.01"
                    disabled={readOnly}
                    value={inputNumber(row.quantity)}
                    onChange={(event) =>
                      update({ quantity: amount(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Unit *">
                  <input
                    aria-label={`Scrap unit ${index + 1}`}
                    maxLength={40}
                    disabled={readOnly}
                    value={row.unit}
                    onChange={(event) => update({ unit: event.target.value })}
                  />
                </Field>
                <Field label="Storage location *">
                  <input
                    aria-label={`Scrap location ${index + 1}`}
                    maxLength={200}
                    disabled={readOnly}
                    value={row.location}
                    placeholder="e.g. Scrap bay A"
                    onChange={(event) =>
                      update({ location: event.target.value })
                    }
                  />
                </Field>
                <Field label="Disposition">
                  <select
                    aria-label={`Scrap disposition ${index + 1}`}
                    disabled={readOnly}
                    value={row.disposition}
                    onChange={(event) =>
                      update({
                        disposition: event.target
                          .value as ScrapEntry["disposition"],
                      })
                    }
                  >
                    {SCRAP_DISPOSITIONS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Disposition date">
                  <input
                    aria-label={`Scrap disposition date ${index + 1}`}
                    type="date"
                    disabled={readOnly}
                    value={row.dispositionDate ?? ""}
                    onChange={(event) =>
                      update({ dispositionDate: event.target.value })
                    }
                  />
                </Field>
                <Field label="Reason for removal *" wide>
                  <textarea
                    aria-label={`Scrap reason ${index + 1}`}
                    maxLength={1000}
                    rows={2}
                    disabled={readOnly}
                    value={row.reason}
                    placeholder="Why was this item removed or discarded?"
                    onChange={(event) => update({ reason: event.target.value })}
                  />
                </Field>
                <Field label="Root cause" wide>
                  <textarea
                    aria-label={`Scrap root cause ${index + 1}`}
                    maxLength={1000}
                    rows={2}
                    disabled={readOnly}
                    value={row.rootCause ?? ""}
                    placeholder="What led to the damage or failure?"
                    onChange={(event) =>
                      update({ rootCause: event.target.value })
                    }
                  />
                </Field>
                <Field label="Estimated total value (₹)">
                  <input
                    aria-label={`Scrap estimated value ${index + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={readOnly}
                    value={inputNumber(row.estimatedValue)}
                    onChange={(event) =>
                      update({
                        estimatedValue: optionalAmount(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Actual recovery amount (₹)">
                  <input
                    aria-label={`Scrap actual recovery ${index + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={readOnly}
                    value={inputNumber(row.actualRecovery)}
                    onChange={(event) =>
                      update({
                        actualRecovery: optionalAmount(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Disposal cost (₹)">
                  <input
                    aria-label={`Scrap disposal cost ${index + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={readOnly}
                    value={inputNumber(row.disposalCost ?? 0)}
                    onChange={(event) =>
                      update({ disposalCost: amount(event.target.value) })
                    }
                  />
                </Field>
              </div>
              <div className="wod-scrap-approval">
                <div>
                  <label className="wod-checkbox">
                    <input
                      type="checkbox"
                      aria-label={`Scrap approval required ${index + 1}`}
                      disabled={readOnly}
                      checked={row.approvalRequired ?? false}
                      onChange={(event) =>
                        update({ approvalRequired: event.target.checked })
                      }
                    />
                    <span>
                      Disposition requires approval
                      <small>
                        Resolve the approval before financial closure.
                      </small>
                    </span>
                  </label>
                  {row.approvalRequired && (
                    <p className="wo-help">
                      {revisedReview
                        ? "Save revised details before recording a new approval decision."
                        : "Approval preview: save the decision to record who reviewed it and when. Changes to the item require a new review."}
                    </p>
                  )}
                </div>
                {row.approvalRequired && (
                  <Field label="Approval status">
                    <select
                      aria-label={`Scrap approval status ${index + 1}`}
                      disabled={readOnly || revisedReview}
                      value={approvalStatus}
                      onChange={(event) =>
                        update({
                          approvalStatus: event.target
                            .value as ScrapEntry["approvalStatus"],
                        })
                      }
                    >
                      <option>Pending</option>
                      <option>Approved</option>
                      <option>Rejected</option>
                    </select>
                  </Field>
                )}
                {row.approvalRequired && approvalStatus !== "Pending" && (
                  <p className="wod-approval-record">
                    {decisionSaved && row.approvalBy && row.approvalAt
                      ? `${approvalStatus} by ${row.approvalBy} · ${new Date(row.approvalAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                      : "Save changes to record this approval decision."}
                  </p>
                )}
              </div>
              <WorkOrderAttachments
                value={row.attachments}
                onChange={(attachments) => update({ attachments })}
                readOnly={readOnly}
                label={`Scrap photos ${index + 1}`}
              />
            </div>
          );
        })
      )}
    </section>
  );
}
