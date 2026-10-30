"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  Pause,
  Pencil,
  Play,
  Users,
} from "lucide-react";
import { useInspections } from "../inspections/InspectionsProvider";
import { useWorkOrders } from "../work-orders/WorkOrdersProvider";
import { useMaintenancePlans } from "./MaintenancePlansProvider";
import {
  occurrenceResult,
  planningToday,
  type MaintenancePlan,
} from "./planning-preview";
import {
  OccurrenceTable,
  PlanningMonthPicker,
  PlanningNotice,
  PlanningStatusBadge,
  planningDateLabel,
  planningMonthBounds,
} from "./PlanningWorkspace";
import "./planning.css";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function PlanDetails({ id }: { id: string }) {
  const planning = useMaintenancePlans();
  if (planning.loading)
    return (
      <div className="pmp-empty" role="status">
        Loading maintenance plan…
      </div>
    );
  if (planning.error)
    return (
      <div className="pmp-empty">
        <h2>Could not load this plan</h2>
        <p role="alert">{planning.error}</p>
        <button type="button" className="tpm-button" onClick={planning.retry}>
          Try again
        </button>
      </div>
    );
  const plan = planning.plans.find((entry) => entry.id === id);
  if (!plan)
    return (
      <div className="pmp-empty">
        <h2>Maintenance plan not found</h2>
        <p>This plan is not available in the current workspace.</p>
        <Link href="/tpm/planning" className="tpm-button">
          Back to planning
        </Link>
      </div>
    );
  return <PlanContent key={plan.id} plan={plan} />;
}

function PlanContent({ plan }: { plan: MaintenancePlan }) {
  const planning = useMaintenancePlans();
  const work = useWorkOrders();
  const inspections = useInspections();
  const [month, setMonth] = useState(() =>
    planningToday(plan.timeZone).slice(0, 7),
  );
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All jobs");
  const [now] = useState(() => Date.now());
  const jobs = planning.occurrences
    .filter((job) => job.planId === plan.id)
    .sort(
      (a, b) =>
        b.scheduledDate.localeCompare(a.scheduledDate) ||
        a.assetName.localeCompare(b.assetName),
    );
  const completed = jobs.filter(
    (job) =>
      occurrenceResult(job, work.orders, inspections.reports, now).status ===
      "Completed",
  );
  const visibleJobs = jobs.filter((job) => {
    const status = occurrenceResult(
      job,
      work.orders,
      inspections.reports,
      now,
    ).status;
    return (
      historyFilter === "All jobs" ||
      (historyFilter === "This month" && job.scheduledDate.startsWith(month)) ||
      (historyFilter === "Open jobs" &&
        !["Completed", "Cancelled", "Skipped"].includes(status)) ||
      (historyFilter === "Completed" && status === "Completed") ||
      (historyFilter === "Skipped" && status === "Skipped")
    );
  });

  function changeStatus(status: MaintenancePlan["status"]) {
    try {
      planning.setPlanStatus(plan.id, status);
      setConfirmArchive(false);
      setNotice({
        text: `Plan ${status === "Active" ? "resumed" : status.toLowerCase()}. Existing job history has been kept.`,
      });
    } catch (cause) {
      setNotice({
        text:
          cause instanceof Error
            ? cause.message
            : "Could not update this plan.",
        error: true,
      });
    }
  }
  function generate() {
    try {
      const bounds = planningMonthBounds(month);
      const count = planning.generateJobs(bounds.from, bounds.to, plan.id);
      setNotice({
        text: count
          ? `${count} ${count === 1 ? "job generated" : "jobs generated"} for this plan.`
          : "No new jobs to add. Existing jobs are kept, and excluded dates are skipped.",
      });
    } catch (cause) {
      setNotice({
        text:
          cause instanceof Error
            ? cause.message
            : "Could not generate scheduled jobs.",
        error: true,
      });
    }
  }

  return (
    <div className="pmp-page">
      <Link className="pmp-back" href="/tpm/planning">
        <ArrowLeft size={16} />
        Maintenance planning
      </Link>
      <header className="pmp-page-heading">
        <div>
          <div className="pmp-detail-code">
            <span>{plan.code}</span>
            <PlanningStatusBadge status={plan.status} />
            <span className="pmp-badge">{plan.kind}</span>
          </div>
          <h1>{plan.name || "Untitled maintenance plan"}</h1>
          <p>
            {plan.kind === "AM"
              ? "Autonomous inspections"
              : "Preventive work orders"}{" "}
            · {plan.frequency.toLowerCase()} · {plan.assetSnapshots.length}{" "}
            {plan.assetSnapshots.length === 1 ? "asset" : "assets"}
          </p>
        </div>
        <div className="pmp-inline-actions">
          {plan.status !== "Archived" && (
            <Link className="tpm-button" href={`/tpm/planning/${plan.id}/edit`}>
              <Pencil size={16} />
              {plan.status === "Draft" ? "Edit & activate" : "Edit plan"}
            </Link>
          )}
          {plan.status === "Active" && (
            <button
              type="button"
              className="tpm-button"
              onClick={() => changeStatus("Paused")}
            >
              <Pause size={15} />
              Pause
            </button>
          )}
          {plan.status === "Paused" && (
            <button
              type="button"
              className="tpm-button primary"
              onClick={() => changeStatus("Active")}
            >
              <Play size={15} />
              Resume
            </button>
          )}
          {plan.status !== "Archived" && (
            <button
              type="button"
              className="tpm-button"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive size={15} />
              Archive
            </button>
          )}
        </div>
      </header>
      <PlanningNotice notice={notice} dismiss={() => setNotice(null)} />
      {confirmArchive && (
        <section className="pmp-archive-confirm">
          <div>
            <strong>Archive this maintenance plan?</strong>
            <p>
              No new jobs can be generated or started. Already linked work
              remains available and the schedule history is retained.
            </p>
          </div>
          <div className="pmp-inline-actions">
            <button
              type="button"
              className="tpm-button primary"
              onClick={() => changeStatus("Archived")}
            >
              Archive plan
            </button>
            <button
              type="button"
              className="tpm-button"
              onClick={() => setConfirmArchive(false)}
            >
              Keep plan
            </button>
          </div>
        </section>
      )}
      {(plan.status === "Paused" || plan.status === "Archived") && (
        <div className="pmp-method-note">
          <Pause size={16} />
          <span>
            {plan.status === "Paused"
              ? "This plan is paused. Resume it to generate or start new jobs. Existing linked work can still be completed."
              : "This plan is archived. Existing linked work and job history remain available."}
          </span>
        </div>
      )}
      <div className="pmp-detail-layout">
        <div className="pmp-detail-main">
          <section className="pmp-card">
            <div className="pmp-card-heading">
              <h2>
                <Factory size={18} />
                Assets
              </h2>
              <span>{plan.assetSnapshots.length} selected</span>
            </div>
            <div className="pmp-detail-assets">
              {plan.assetSnapshots.length ? (
                plan.assetSnapshots.map((asset) => (
                  <Link key={asset.id} href={`/tpm/assets/${asset.id}`}>
                    <span className="pmp-asset-icon">
                      <Factory size={19} />
                    </span>
                    <div>
                      <strong>{asset.name}</strong>
                      <small>
                        {asset.code}
                        {asset.location ? ` · ${asset.location}` : ""}
                      </small>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="pmp-muted">
                  No assets selected yet. Add assets before activating the plan.
                </p>
              )}
            </div>
          </section>
          <section className="pmp-card">
            <div className="pmp-card-heading">
              <h2>
                <ClipboardCheck size={18} />
                {plan.kind === "AM"
                  ? "Inspection checklist"
                  : "Tasks & checklist"}
              </h2>
            </div>
            <div className="pmp-detail-body">
              {plan.kind === "PM" &&
                (plan.tasks.length ? (
                  <ol className="pmp-task-list">
                    {plan.tasks.map((task, index) => (
                      <li key={task.id}>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{task.title}</strong>
                          {task.description && <p>{task.description}</p>}
                          {task.estimatedHours && (
                            <small>{task.estimatedHours} hours estimated</small>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="pmp-muted">No work tasks added yet.</p>
                ))}
              {plan.checklist ? (
                <div className="pmp-checklist-summary">
                  <div>
                    <ClipboardCheck size={19} />
                    <div>
                      <strong>{plan.checklist.name}</strong>
                      <small>
                        {plan.checklist.items.length} inspection checks · saved
                        with this plan
                      </small>
                    </div>
                  </div>
                  <ol>
                    {plan.checklist.items.map((item, index) => (
                      <li key={item.id}>
                        {index + 1}. {item.title}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p className="pmp-muted">
                  {plan.kind === "AM"
                    ? "Choose a published AM checklist before activating the plan."
                    : "No inspection checklist attached."}
                </p>
              )}
              <p className="pmp-detail-note">
                Each generated job keeps its own tasks and checklist snapshot.
                Later plan edits apply to newly generated jobs.
              </p>
            </div>
          </section>
          <section className="pmp-card">
            <div className="pmp-card-heading">
              <h2>
                <CalendarDays size={18} />
                Schedule & exceptions
              </h2>
            </div>
            <div className="pmp-detail-body">
              <dl className="pmp-definition-grid">
                <div>
                  <dt>Repeats</dt>
                  <dd>{plan.frequency}</dd>
                </div>
                <div>
                  <dt>Start date</dt>
                  <dd>{planningDateLabel(plan.startDate)}</dd>
                </div>
                <div>
                  <dt>End date</dt>
                  <dd>
                    {plan.endDate
                      ? planningDateLabel(plan.endDate)
                      : "No end date"}
                  </dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>
                    {plan.dueTime}
                    {plan.dueWindowDays
                      ? ` · ${plan.dueWindowDays} days after planned date`
                      : " on planned date"}
                  </dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{plan.timeZone}</dd>
                </div>
                <div>
                  <dt>Excluded weekdays</dt>
                  <dd>
                    {plan.excludedWeekdays.length
                      ? plan.excludedWeekdays
                          .map((day) => WEEKDAYS[day])
                          .join(", ")
                      : "None"}
                  </dd>
                </div>
              </dl>
              <div className="pmp-excluded-dates">
                <span>Excluded dates</span>
                {plan.excludedDates.length ? (
                  <div>
                    {plan.excludedDates.map((date) => (
                      <span className="pmp-badge" key={date}>
                        {planningDateLabel(date, true)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>No additional dates excluded.</p>
                )}
              </div>
              <p className="pmp-detail-note">
                Excluded dates stay on the schedule as skipped jobs, with their
                reason. They do not count toward completion compliance.
              </p>
            </div>
          </section>
          {plan.notes && (
            <section className="pmp-card">
              <div className="pmp-card-heading">
                <h2>Instructions & notes</h2>
              </div>
              <p className="pmp-plan-notes">{plan.notes}</p>
            </section>
          )}
        </div>
        <aside className="pmp-detail-aside">
          <section className="pmp-card">
            <div className="pmp-card-heading">
              <h2>
                <Users size={18} />
                Assignment & resources
              </h2>
            </div>
            <dl className="pmp-aside-definitions">
              <div>
                <dt>Assigned to</dt>
                <dd>{plan.assigneeName || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Team</dt>
                <dd>{plan.team || "Not specified"}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <PlanningStatusBadge status={plan.priority} />
                </dd>
              </div>
              <div>
                <dt>Estimated duration per job</dt>
                <dd>
                  <Clock3 size={15} />
                  {plan.estimatedMinutes} minutes
                </dd>
              </div>
              <div>
                <dt>Planned manpower</dt>
                <dd>
                  {plan.manpower} {plan.manpower === 1 ? "person" : "people"}
                </dd>
              </div>
              <div>
                <dt>Estimated labour per job</dt>
                <dd>
                  {Number(
                    ((plan.estimatedMinutes * plan.manpower) / 60).toFixed(2),
                  )}{" "}
                  person-hours
                </dd>
              </div>
            </dl>
          </section>
          <section className="pmp-card pmp-plan-progress">
            <h2>Execution overview</h2>
            <div>
              <span>
                <CalendarDays size={18} />
                Generated jobs
              </span>
              <strong>{jobs.length}</strong>
            </div>
            <div>
              <span>
                <CheckCircle2 size={18} />
                Completed
              </span>
              <strong>
                {work.loading ||
                inspections.loading ||
                work.error ||
                inspections.error
                  ? "—"
                  : completed.length}
              </strong>
            </div>
            <div>
              <span>
                <Archive size={18} />
                Skipped
              </span>
              <strong>
                {jobs.filter((job) => job.state === "Skipped").length}
              </strong>
            </div>
            <p>
              Completion follows the linked inspection or work order. Required
              checks must also be finished.
            </p>
          </section>
        </aside>
      </div>
      <section className="pmp-card pmp-job-history">
        <div className="pmp-card-heading pmp-history-heading">
          <div>
            <h2>Scheduled jobs & history</h2>
            <p>
              Start maintenance from a scheduled job to keep its planned and
              actual records connected.
            </p>
          </div>
          <select
            aria-label="Filter job history"
            value={historyFilter}
            onChange={(event) => setHistoryFilter(event.target.value)}
          >
            {[
              "All jobs",
              "This month",
              "Open jobs",
              "Completed",
              "Skipped",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="pmp-history-generate">
          <PlanningMonthPicker month={month} onChange={setMonth} />
          <button
            type="button"
            className="tpm-button"
            disabled={plan.status !== "Active"}
            title={
              plan.status !== "Active"
                ? "Activate or resume the plan first"
                : undefined
            }
            onClick={generate}
          >
            <CalendarPlus size={17} />
            Generate this month&apos;s jobs
          </button>
        </div>
        <OccurrenceTable
          occurrences={visibleJobs}
          showPlan={false}
          emptyText={
            jobs.length
              ? "No jobs match this history filter."
              : "No jobs generated yet. Activate the plan, choose a month, and generate its scheduled jobs."
          }
        />
      </section>
    </div>
  );
}
