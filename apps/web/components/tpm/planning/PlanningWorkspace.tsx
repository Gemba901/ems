"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Factory,
  List,
  Plus,
  Search,
  SkipForward,
  Target,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useInspections } from "../inspections/InspectionsProvider";
import { useWorkOrders } from "../work-orders/WorkOrdersProvider";
import { formatWorkOrderDuration } from "../work-orders/work-order-types";
import { useMaintenancePlans } from "./MaintenancePlansProvider";
import {
  occurrenceResult,
  planningToday,
  type PlanOccurrence,
} from "./planning-preview";
import "./planning.css";

type Notice = { text: string; error?: boolean } | null;
const JOB_STATUSES = [
  "Scheduled",
  "Due",
  "Overdue",
  "In progress",
  "Pending checks",
  "Completed",
  "Skipped",
  "Cancelled",
  "Missing record",
];
const PLAN_STATUSES = ["Draft", "Active", "Paused", "Archived"];
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

export function planningDateLabel(date: string, short = false) {
  if (!date) return "—";
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" as const }),
    timeZone: "UTC",
  }).format(parsed);
}

export function planningTimeLabel(
  value: string | null | undefined,
  timeZone: string,
) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function planningMonthBounds(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${last}` };
}

function moveMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export function PlanningStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`pmp-badge pmp-status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}

export function PlanningMonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  return (
    <div className="pmp-month-picker">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(moveMonth(month, -1))}
      >
        <ChevronLeft size={17} />
      </button>
      <span>
        <CalendarDays size={16} />
        {label}
      </span>
      <button
        type="button"
        aria-label="Next month"
        onClick={() => onChange(moveMonth(month, 1))}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

export function PlanningNotice({
  notice,
  dismiss,
}: {
  notice: Notice;
  dismiss?: () => void;
}) {
  if (!notice) return null;
  return (
    <div
      className={`pmp-notice ${notice.error ? "pmp-notice-error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      {notice.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      <span>{notice.text}</span>
      {dismiss && (
        <button type="button" aria-label="Dismiss message" onClick={dismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Execution status is projected from the existing reports and work orders. */
export function OccurrenceTable({
  occurrences,
  emptyText = "No jobs in this period. Generate jobs from an active plan to get started.",
  showPlan = true,
}: {
  occurrences: PlanOccurrence[];
  emptyText?: string;
  showPlan?: boolean;
}) {
  const { plans, startJob, skipJob } = useMaintenancePlans();
  const work = useWorkOrders();
  const inspections = useInspections();
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  function openJob(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      const result = startJob(id);
      router.push(result.href);
    } catch (cause) {
      setNotice({ text: errorMessage(cause), error: true });
    } finally {
      setBusy(null);
    }
  }
  function confirmSkip() {
    if (!skipping) return;
    try {
      skipJob(skipping, reason);
      setSkipping(null);
      setReason("");
      setNotice({
        text: "Job skipped. Its original planned date and reason remain in the history.",
      });
    } catch (cause) {
      setNotice({ text: errorMessage(cause), error: true });
    }
  }

  if (work.loading || inspections.loading)
    return (
      <div className="pmp-empty" role="status">
        Loading linked work…
      </div>
    );
  if (work.error || inspections.error)
    return (
      <div className="pmp-empty">
        <p role="alert">{work.error || inspections.error}</p>
        <button
          type="button"
          className="tpm-button"
          onClick={() => {
            work.retry();
            inspections.retry();
          }}
        >
          Retry linked work
        </button>
      </div>
    );
  return (
    <>
      <PlanningNotice notice={notice} dismiss={() => setNotice(null)} />
      {skipping && (
        <form
          className="pmp-skip-form"
          onSubmit={(event) => {
            event.preventDefault();
            confirmSkip();
          }}
        >
          <div>
            <strong>Skip this scheduled job</strong>
            <p>
              Keep a reason in the plan history. Started jobs cannot be skipped.
            </p>
          </div>
          <label htmlFor="pmp-skip-reason">
            Reason <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="pmp-skip-reason"
            autoFocus
            required
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="pmp-inline-actions">
            <button
              type="submit"
              className="tpm-button primary"
              disabled={!reason.trim()}
            >
              Confirm skip
            </button>
            <button
              type="button"
              className="tpm-button"
              onClick={() => {
                setSkipping(null);
                setReason("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {!occurrences.length ? (
        <div className="pmp-empty">
          <CalendarDays size={29} />
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="pmp-table-scroll">
          <table className="pmp-table">
            <thead>
              <tr>
                <th>Planned date / asset</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Completed</th>
                <th>Time (HH:MM:SS)</th>
                <th>
                  <span className="pmp-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((job) => {
                const result = occurrenceResult(
                  job,
                  work.orders,
                  inspections.reports,
                  now,
                );
                const linked = !!job.executionId;
                const plan = plans.find((entry) => entry.id === job.planId);
                const futureInspection =
                  job.kind === "AM" &&
                  job.scheduledDate > planningToday(job.timeZone);
                const canStart = plan?.status === "Active" && !futureInspection;
                const unavailable = result.status === "Missing record";
                const canSkip = !linked && job.state !== "Skipped";
                const canOpen =
                  job.state !== "Skipped" &&
                  !unavailable &&
                  (linked || canStart);
                const buttonLabel = linked
                  ? job.kind === "AM"
                    ? "Open inspection"
                    : "Open work order"
                  : job.kind === "AM"
                    ? "Start inspection"
                    : "Create work order";
                return (
                  <tr key={job.id} id={`job-${job.id}`}>
                    <td>
                      <strong>
                        {planningDateLabel(job.scheduledDate)}
                      </strong>
                      <Link
                        href={`/tpm/assets/${job.assetId}`}
                        className="pmp-table-asset"
                      >
                        {job.assetName}
                      </Link>
                      <small>
                        {job.assetCode} · {job.kind}
                      </small>
                      {showPlan && (
                        <Link
                          className="pmp-table-plan"
                          href={`/tpm/planning/${job.planId}`}
                        >
                          {job.planCode} · {job.planName}
                        </Link>
                      )}
                    </td>
                    <td>
                      <span>{planningTimeLabel(job.dueAt, job.timeZone)}</span>
                      <small>{job.timeZone}</small>
                    </td>
                    <td>
                      <PlanningStatusBadge status={result.status} />
                      {job.skipReason && (
                        <small className="pmp-wrap">{job.skipReason}</small>
                      )}
                      {result.issueCount > 0 && (
                        <small className="pmp-warning-text">
                          {result.issueCount} inspection{" "}
                          {result.issueCount === 1 ? "issue" : "issues"}
                        </small>
                      )}
                      {result.status === "Completed" && (
                        <small>
                          {result.onTime ? "On time" : "Completed late"}
                        </small>
                      )}
                      {result.status === "Pending checks" && (
                        <small className="pmp-wrap">
                          Finish required checks in the work order.
                        </small>
                      )}
                      {unavailable && (
                        <small className="pmp-wrap">
                          Restore the linked record to continue.
                        </small>
                      )}
                    </td>
                    <td>
                      {planningTimeLabel(result.completedAt, job.timeZone)}
                      {result.executionCode && (
                        <small>{result.executionCode}</small>
                      )}
                    </td>
                    <td>
                      <strong className="pmp-duration">
                        {result.actualSeconds === null
                          ? "—"
                          : formatWorkOrderDuration(result.actualSeconds)}
                      </strong>
                      <small>
                        Planned{" "}
                        {formatWorkOrderDuration(job.plannedMinutes * 60)}
                      </small>
                      <small>
                        {job.kind === "PM" ? "Task time" : "Inspection elapsed"}
                      </small>
                    </td>
                    <td>
                      <div className="pmp-row-actions">
                        {job.state !== "Skipped" && !unavailable && (
                          <button
                            type="button"
                            className="tpm-button pmp-small-button"
                            disabled={!canOpen || busy === job.id}
                            title={
                              !linked && !canStart
                                ? futureInspection
                                  ? "Available on the scheduled date"
                                  : "Activate or resume this plan first"
                                : undefined
                            }
                            onClick={() => openJob(job.id)}
                          >
                            {busy === job.id ? "Opening…" : buttonLabel}
                            <ArrowRight size={14} />
                          </button>
                        )}
                        {canSkip && (
                          <button
                            type="button"
                            className="pmp-text-button"
                            onClick={() => {
                              setSkipping(job.id);
                              setReason("");
                              setNotice(null);
                            }}
                          >
                            <SkipForward size={13} />
                            Skip
                          </button>
                        )}
                        {!linked &&
                          futureInspection &&
                          job.state !== "Skipped" && (
                            <small>Available on planned date</small>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function PlanningWorkspace() {
  const planning = useMaintenancePlans();
  const work = useWorkOrders();
  const inspections = useInspections();
  const user = useAuthStore((state) => state.user);
  const timeZone = user?.organizationTimeZone || "Asia/Kolkata";
  const today = planningToday(timeZone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [view, setView] = useState("Plans");
  const [search, setSearch] = useState("");
  const [planStatus, setPlanStatus] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [kind, setKind] = useState("");
  const [selectedDay, setSelectedDay] = useState(today);
  const [notice, setNotice] = useState<Notice>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const bounds = planningMonthBounds(month);
  const monthJobs = useMemo(
    () =>
      planning.occurrences.filter((job) => job.scheduledDate.startsWith(month)),
    [planning.occurrences, month],
  );
  const results = useMemo(
    () =>
      monthJobs.map((job) => ({
        job,
        result: occurrenceResult(job, work.orders, inspections.reports, now),
      })),
    [monthJobs, work.orders, inspections.reports, now],
  );
  const eligible = results.filter(
    ({ job, result }) =>
      new Date(job.dueAt).getTime() <= now &&
      !["Skipped", "Cancelled"].includes(result.status),
  );
  const complete = eligible.filter(
    ({ result }) => result.status === "Completed",
  );
  const onTime = complete.filter(({ result }) => result.onTime);
  const overdue = results.filter(
    ({ job, result }) =>
      new Date(job.dueAt).getTime() < now &&
      !["Completed", "Skipped", "Cancelled"].includes(result.status),
  );
  const active = planning.plans.filter((plan) => plan.status === "Active");
  const needle = search.trim().toLowerCase();
  const visiblePlans = planning.plans.filter(
    (plan) =>
      (!planStatus || plan.status === planStatus) &&
      (!kind || plan.kind === kind) &&
      `${plan.code} ${plan.name} ${plan.assigneeName} ${plan.assetSnapshots.map((asset) => `${asset.name} ${asset.code}`).join(" ")}`
        .toLowerCase()
        .includes(needle),
  );
  const visibleJobs = results
    .filter(
      ({ job, result }) =>
        (!jobStatus || result.status === jobStatus) &&
        (!kind || job.kind === kind) &&
        `${job.planName} ${job.planCode} ${job.assetName} ${job.assetCode} ${job.assigneeName}`
          .toLowerCase()
          .includes(needle),
    )
    .map(({ job }) => job)
    .sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        a.assetName.localeCompare(b.assetName),
    );
  const date = selectedDay.startsWith(month) ? selectedDay : bounds.from;
  const dayJobs = visibleJobs.filter((job) => job.scheduledDate === date);
  const first = new Date(`${bounds.from}T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const lastDay = Number(bounds.to.slice(-2));
  const calendarDays = Array.from(
    { length: Math.ceil((offset + lastDay) / 7) * 7 },
    (_, index) => index - offset + 1,
  );
  const loaded = !planning.loading && !work.loading && !inspections.loading;
  const error = planning.error || work.error || inspections.error;

  function generate() {
    try {
      const count = planning.generateJobs(bounds.from, bounds.to);
      setNotice({
        text: count
          ? `${count} scheduled ${count === 1 ? "job added" : "jobs added"} for this month. Open a job when you are ready to start.`
          : "No new jobs to add. This month's eligible jobs already exist, or the active plans have no dates in this period.",
      });
    } catch (cause) {
      setNotice({ text: errorMessage(cause), error: true });
    }
  }

  return (
    <div className="pmp-page">
      <header className="pmp-page-heading">
        <div>
          <span className="pmp-eyebrow">MAINTENANCE PLANNING</span>
          <h1>PM Planning & Calendar</h1>
          <p>
            Plan recurring maintenance, schedule jobs, and follow the work
            through to completion.
          </p>
        </div>
        <Link className="tpm-button primary" href="/tpm/planning/new">
          <Plus size={17} />
          New plan
        </Link>
      </header>
      <PlanningNotice notice={notice} dismiss={() => setNotice(null)} />
      {!loaded ? (
        <div className="pmp-empty" role="status">
          Loading maintenance planning…
        </div>
      ) : error ? (
        <div className="pmp-empty">
          <h2>Could not load maintenance planning</h2>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="tpm-button"
            onClick={() => {
              planning.retry();
              work.retry();
              inspections.retry();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="pmp-summary">
            <div className="pmp-kpi">
              <span className="pmp-kpi-icon indigo">
                <ClipboardList size={21} />
              </span>
              <div>
                <strong>{active.length}</strong>
                <span>Active plans</span>
                <small>{planning.plans.length} plans in your register</small>
              </div>
            </div>
            <div className="pmp-kpi">
              <span className="pmp-kpi-icon blue">
                <CalendarDays size={21} />
              </span>
              <div>
                <strong>{monthJobs.length}</strong>
                <span>Scheduled jobs</span>
                <small>For the selected month</small>
              </div>
            </div>
            <div className="pmp-kpi">
              <span className="pmp-kpi-icon amber">
                <Clock3 size={21} />
              </span>
              <div>
                <strong>{overdue.length}</strong>
                <span>Overdue jobs</span>
                <small>
                  {
                    results.filter(({ result }) => result.status === "Due")
                      .length
                  }{" "}
                  due and ready to start
                </small>
              </div>
            </div>
            <div className="pmp-kpi">
              <span className="pmp-kpi-icon green">
                <Target size={21} />
              </span>
              <div>
                <strong>
                  {eligible.length
                    ? `${Math.round((onTime.length / eligible.length) * 100)}%`
                    : "—"}
                </strong>
                <span>On-time completion</span>
                <small>
                  {onTime.length} of {eligible.length} eligible due jobs
                </small>
              </div>
            </div>
          </div>
          <section className="pmp-planning-bar">
            <div>
              <PlanningMonthPicker month={month} onChange={setMonth} />
              <button
                type="button"
                className="pmp-text-button"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelectedDay(today);
                }}
              >
                This month
              </button>
            </div>
            <div className="pmp-generation">
              <p>Generate this month&apos;s jobs from active plans.</p>
              <button
                type="button"
                className="tpm-button"
                disabled={!active.length}
                onClick={generate}
              >
                <CalendarPlus size={17} />
                Generate jobs
              </button>
            </div>
          </section>
          <div className="pmp-view-bar">
            <nav className="pmp-tabs" aria-label="Planning views">
              {[
                { label: "Plans", icon: List },
                { label: "Calendar", icon: CalendarDays },
                { label: "Plan vs Actual", icon: Target },
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={view === label}
                  className={view === label ? "active" : ""}
                  onClick={() => setView(label)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
            <Link
              href="/tpm/health-checkups/schedule"
              className="pmp-text-link"
            >
              Health checkup schedule
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="pmp-filters">
            <label className="pmp-search">
              <Search size={17} />
              <input
                aria-label="Search maintenance plans and jobs"
                placeholder={
                  view === "Plans"
                    ? "Search plan, asset, or assignee…"
                    : "Search scheduled jobs…"
                }
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select
              aria-label="Maintenance type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">All maintenance types</option>
              <option value="AM">AM · Autonomous</option>
              <option value="PM">PM · Preventive</option>
            </select>
            {view === "Plans" ? (
              <select
                aria-label="Plan status"
                value={planStatus}
                onChange={(event) => setPlanStatus(event.target.value)}
              >
                <option value="">All plan statuses</option>
                {PLAN_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Job status"
                value={jobStatus}
                onChange={(event) => setJobStatus(event.target.value)}
              >
                <option value="">All job statuses</option>
                {JOB_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            )}
          </div>
          {view === "Plans" && (
            <section className="pmp-plans">
              <div className="pmp-section-title">
                <h2>
                  Maintenance plans <span>{visiblePlans.length}</span>
                </h2>
                <span>Recurring AM inspections & PM work orders</span>
              </div>
              {!visiblePlans.length ? (
                <div className="pmp-empty pmp-card">
                  <CalendarPlus size={32} />
                  <h3>
                    {planning.plans.length
                      ? "No plans match your filters"
                      : "Give every asset a maintenance plan"}
                  </h3>
                  <p>
                    {planning.plans.length
                      ? "Change the search or filters to see more plans."
                      : "Choose assets, define checks or tasks, and set a repeat schedule."}
                  </p>
                  {!planning.plans.length && (
                    <Link
                      href="/tpm/planning/new"
                      className="tpm-button primary"
                    >
                      <Plus size={16} />
                      Create your first plan
                    </Link>
                  )}
                </div>
              ) : (
                <div className="pmp-plan-list">
                  {visiblePlans.map((plan) => {
                    const next = planning.occurrences
                      .filter(
                        (job) =>
                          job.planId === plan.id &&
                          job.state !== "Skipped" &&
                          job.scheduledDate >= today &&
                          !["Completed", "Cancelled"].includes(
                            occurrenceResult(
                              job,
                              work.orders,
                              inspections.reports,
                              now,
                            ).status,
                          ),
                      )
                      .sort((a, b) =>
                        a.scheduledDate.localeCompare(b.scheduledDate),
                      )[0];
                    return (
                      <article className="pmp-plan-card" key={plan.id}>
                        <div className="pmp-plan-main">
                          <span
                            className={`pmp-plan-kind ${plan.kind.toLowerCase()}`}
                          >
                            {plan.kind}
                          </span>
                          <div>
                            <Link
                              href={`/tpm/planning/${plan.id}`}
                              className="pmp-plan-name"
                            >
                              {plan.name || "Untitled plan"}
                            </Link>
                            <span className="pmp-plan-code">
                              {plan.code} ·{" "}
                              {plan.kind === "AM"
                                ? "Autonomous maintenance"
                                : "Preventive maintenance"}
                            </span>
                            <div className="pmp-asset-label">
                              <Factory size={14} />
                              <span>
                                {plan.assetSnapshots
                                  .slice(0, 2)
                                  .map((asset) => asset.name)
                                  .join(", ") || "No assets selected"}
                                {plan.assetSnapshots.length > 2
                                  ? ` +${plan.assetSnapshots.length - 2} more`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="pmp-plan-schedule">
                          <span>{plan.frequency}</span>
                          <small>
                            {plan.assetIds.length}{" "}
                            {plan.assetIds.length === 1 ? "asset" : "assets"} ·{" "}
                            {plan.estimatedMinutes} min / job
                          </small>
                        </div>
                        <div className="pmp-plan-next">
                          <small>Next generated job</small>
                          <strong>
                            {next
                              ? planningDateLabel(next.scheduledDate, true)
                              : "No upcoming jobs"}
                          </strong>
                          <small>
                            {next
                              ? next.assetName
                              : plan.status === "Active"
                                ? "Use Generate jobs"
                                : plan.status === "Paused"
                                  ? "Resume the plan to schedule"
                                  : plan.status === "Archived"
                                    ? "Schedule archived"
                                    : "Activate the plan to schedule"}
                          </small>
                        </div>
                        <div className="pmp-plan-end">
                          <PlanningStatusBadge status={plan.status} />
                          <Link
                            href={`/tpm/planning/${plan.id}`}
                            aria-label={`View ${plan.name}`}
                            className="pmp-icon-link"
                          >
                            <ChevronRight size={19} />
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {view === "Calendar" && (
            <>
              <section className="pmp-card pmp-calendar">
                <div className="pmp-section-title">
                  <h2>Maintenance calendar</h2>
                  <span>
                    {visibleJobs.length} jobs · dates shown in each plan&apos;s
                    timezone
                  </span>
                </div>
                <div className="pmp-calendar-scroll">
                  <div className="pmp-calendar-weekdays">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                      (day) => (
                        <span key={day}>{day}</span>
                      ),
                    )}
                  </div>
                  <div className="pmp-calendar-grid">
                    {calendarDays.map((day, index) => {
                      if (day < 1 || day > lastDay)
                        return (
                          <div
                            key={`blank-${index}`}
                            className="pmp-calendar-day pmp-calendar-outside"
                          />
                        );
                      const iso = `${month}-${String(day).padStart(2, "0")}`;
                      const jobs = visibleJobs.filter(
                        (job) => job.scheduledDate === iso,
                      );
                      return (
                        <div
                          key={iso}
                          className={`pmp-calendar-day ${date === iso ? "selected" : ""} ${today === iso ? "today" : ""}`}
                        >
                          <button
                            type="button"
                            className="pmp-day-number"
                            aria-label={`Show jobs for ${planningDateLabel(iso)}`}
                            aria-pressed={date === iso}
                            onClick={() => setSelectedDay(iso)}
                          >
                            {day}
                          </button>
                          <div className="pmp-calendar-events">
                            {jobs.slice(0, 3).map((job) => {
                              const result = occurrenceResult(
                                job,
                                work.orders,
                                inspections.reports,
                                now,
                              );
                              return (
                                <Link
                                  key={job.id}
                                  className={`pmp-calendar-event ${result.status.toLowerCase().replaceAll(" ", "-")}`}
                                  title={`${job.planName} · ${job.assetName} · ${result.status}`}
                                  href={`/tpm/planning/${job.planId}#job-${job.id}`}
                                >
                                  <span>{job.kind}</span>
                                  {job.assetName}
                                  <small>{result.status}</small>
                                </Link>
                              );
                            })}
                            {jobs.length > 3 && (
                              <button
                                type="button"
                                className="pmp-more-events"
                                onClick={() => setSelectedDay(iso)}
                              >
                                +{jobs.length - 3} more jobs
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
              <section className="pmp-card">
                <div className="pmp-section-title pmp-card-heading">
                  <h2>{planningDateLabel(date)}</h2>
                  <span>{dayJobs.length} scheduled jobs</span>
                </div>
                <OccurrenceTable
                  occurrences={dayJobs}
                  emptyText="No jobs scheduled for this day. Select another date or generate jobs for this month."
                />
              </section>
            </>
          )}
          {view === "Plan vs Actual" && (
            <section className="pmp-card">
              <div className="pmp-card-heading pmp-actual-heading">
                <div>
                  <h2>Plan vs Actual</h2>
                  <p>
                    Original planned dates stay fixed when execution runs late.
                  </p>
                </div>
                <div className="pmp-actual-totals">
                  <span>
                    <strong>
                      {complete.length}/{eligible.length}
                    </strong>{" "}
                    Due jobs completed
                  </span>
                  <span>
                    <strong>
                      {
                        results.filter(
                          ({ result }) => result.status === "Skipped",
                        ).length
                      }
                    </strong>{" "}
                    Skipped
                  </span>
                </div>
              </div>
              <div className="pmp-method-note">
                <AlertCircle size={16} />
                <span>
                  On-time completion uses jobs whose deadline has passed;
                  skipped, cancelled, and future jobs are excluded. Recorded
                  time is task time for PM and elapsed inspection time for AM,
                  not machine downtime.
                </span>
              </div>
              <OccurrenceTable
                occurrences={visibleJobs}
                emptyText={
                  monthJobs.length
                    ? "No scheduled jobs match your filters."
                    : "No generated jobs in this month. Generate jobs from an active plan to compare planned and completed work."
                }
              />
            </section>
          )}
          <p className="pmp-footer-note">
            Jobs are generated when you choose Generate jobs. Repeating this
            action keeps existing jobs and adds only missing occurrences.
          </p>
        </>
      )}
    </div>
  );
}
