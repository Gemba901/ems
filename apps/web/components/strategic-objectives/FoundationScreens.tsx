"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  ListTree,
  LockKeyhole,
  Pencil,
  Plus,
  Target,
} from "lucide-react";
import { STRATEGIC_OBJECTIVES_ROUTES as routes } from "@/services/strategic-objectives/routes";
import { smartReadiness } from "@/services/strategic-objectives/rules";
import type {
  DemoSession,
  Department,
  Employee,
  GoalData,
  ObjectiveView,
  Pillar,
  PlanningPeriod,
  RecordView,
} from "@/services/strategic-objectives";
import { useStrategicObjectives } from "./StrategicObjectivesShell";

const panel =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const primaryLink =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";

type RegisterData = {
  session: DemoSession;
  objectives: ObjectiveView[];
  employees: Employee[];
  departments: Department[];
  pillars: Pillar[];
  periods: PlanningPeriod[];
};
function useFoundationData() {
  const { service } = useStrategicObjectives();
  const [data, setData] = useState<RegisterData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      service.getSession(),
      service.getObjectives(),
      service.getEmployees(),
      service.getDepartments(),
      service.getPillars(),
      service.getPlanningPeriods(),
    ])
      .then(
        ([session, objectives, employees, departments, pillars, periods]) => {
          if (!cancelled)
            setData({
              session,
              objectives,
              employees,
              departments,
              pillars,
              periods,
            });
        },
      )
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open the sample plan.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [service, attempt]);
  return {
    data,
    error,
    retry: () => {
      setError("");
      setAttempt((value) => value + 1);
    },
  };
}

export function StrategicGuide() {
  return (
    <div className="space-y-6">
      <section className={panel}>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
          A shared direction
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          One company plan, connected contributions.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Objectives describe the direction and outcomes you want. Linked goals
          turn that direction into measurable achievements with an owner and a
          deadline.
        </p>
        <Link href={routes.register} className={`${primaryLink} mt-5`}>
          Open Objectives & Goals Register
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            Icon: Target,
            title: "1. Set direction",
            body: "Start with a few meaningful objectives. Choose one primary pillar for each; every pillar does not need an objective.",
          },
          {
            Icon: ListTree,
            title: "2. Link measurable goals",
            body: "Normally add one or two goals per objective. Name the contributing departments and give each goal its own measure and target.",
          },
          {
            Icon: CheckCircle2,
            title: "3. Approve and share",
            body: "One authorised approver checks readiness. Approved goals give departments a shared reference without entering the company goal again.",
          },
        ].map(({ Icon, title, body }) => (
          <section key={title} className={panel}>
            <Icon className="mb-4 text-teal-700" size={23} aria-hidden="true" />
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </section>
        ))}
      </div>
      <section className={panel}>
        <h3 className="font-semibold">Try the demo roles</h3>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">CEO / Authorised Leadership</dt>
            <dd className="mt-1 leading-6 text-slate-600">
              Can prepare drafts and propose revisions.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Approver</dt>
            <dd className="mt-1 leading-6 text-slate-600">
              The single person authorised to approve a ready record.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Employee / HOD</dt>
            <dd className="mt-1 leading-6 text-slate-600">
              Reads only approved items effective today. Pending revisions
              remain hidden.
            </dd>
          </div>
        </dl>
        <p className="mt-5 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
          Company goal achievement uses its own verified measures. Department
          contributions and employee scores never replace it. You can now create
          and continue objective and linked goal drafts. Use Add Goal inside an
          objective in the register. Approval and revision screens follow in a
          later step.
        </p>
      </section>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const color =
    value === "Approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : value === "Revised"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}
    >
      {value === "Approved" && <LockKeyhole size={11} aria-hidden="true" />}
      {value}
    </span>
  );
}

function History<T>({
  record,
  employees,
}: {
  record: RecordView<T>;
  employees: Employee[];
}) {
  const name = (id: string) =>
    employees.find((item) => item.id === id)?.name ?? "Unknown person";
  return (
    <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
      <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline-2 focus-visible:outline-teal-600">
        Version history & audit
      </summary>
      <div className="mt-3 space-y-3">
        {[record.current, ...record.history].map((entry) => (
          <div key={entry.number} className="rounded-lg bg-slate-50 p-3">
            <strong>
              Version {entry.number} · {entry.status}
            </strong>
            <p className="mt-1">
              Last updated {entry.updatedAt.slice(0, 10)} by{" "}
              {name(entry.updatedBy)}
            </p>
            {entry.changeReason && (
              <p className="mt-1">Reason: {entry.changeReason}</p>
            )}
            {entry.effectiveDate && (
              <p className="mt-1">Effective: {entry.effectiveDate}</p>
            )}
            {entry.approvedBy && (
              <p className="mt-1">Approved by {name(entry.approvedBy)}</p>
            )}
          </div>
        ))}
        <ul className="space-y-1.5">
          {record.audit.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              {entry.action} · v{entry.version} · {name(entry.actorId)} ·{" "}
              {entry.at.slice(0, 16).replace("T", " ")} UTC
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function GoalFacts({
  goal,
  employees,
}: {
  goal: GoalData;
  employees: Employee[];
}) {
  const facts = [
    [
      "Baseline",
      goal.baseline === null ? "Not recorded" : `${goal.baseline} ${goal.unit}`,
    ],
    [
      "Target",
      goal.target === null ? "Not set" : `${goal.target} ${goal.unit}`,
    ],
    [
      "Owner",
      employees.find((item) => item.id === goal.ownerId)?.name ??
        "Not assigned",
    ],
    ["Deadline", goal.deadline || "Not set"],
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="mt-1 break-words font-medium text-slate-800">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StrategicRegister({
  highlightObjectiveId,
  highlightGoalId,
}: {
  highlightObjectiveId?: string;
  highlightGoalId?: string;
}) {
  const { data, error, retry } = useFoundationData();
  useEffect(() => {
    if (!data) return;
    const objective = data.objectives.find(
      (item) => item.id === highlightObjectiveId,
    );
    if (!objective) return;
    const goal = objective.goals.find((item) => item.id === highlightGoalId);
    const element = document.getElementById(
      goal ? `goal-${goal.id}` : `objective-${objective.id}`,
    );
    element?.scrollIntoView({ block: "start" });
    element?.focus({ preventScroll: true });
  }, [data, highlightObjectiveId, highlightGoalId]);
  if (error)
    return (
      <section className={panel}>
        <p role="alert">{error}</p>
        <button onClick={retry} className={`${primaryLink} mt-4`}>
          Try again
        </button>
      </section>
    );
  if (!data)
    return (
      <p role="status" className="py-12 text-center text-sm text-slate-500">
        Opening the company plan…
      </p>
    );
  const { objectives, session, employees, departments, pillars, periods } =
    data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">
            Objectives & Goals Register
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {objectives.length} objectives ·{" "}
            {objectives.reduce((sum, item) => sum + item.goals.length, 0)}{" "}
            linked goals · One company plan
          </p>
        </div>
        {session.canEdit && (
          <Link className={primaryLink} href={routes.create}>
            <FilePlus2 size={16} aria-hidden="true" />
            Create Objective
          </Link>
        )}
      </div>
      <p className="text-sm leading-6 text-slate-600">
        {session.role === "READER"
          ? "Read-only view: approved items effective today. A pending amendment does not replace the previous approved version."
          : session.canApprove
            ? "Approver view: review the sample drafts, approvals and amendments. Approval controls are part of a later step."
            : "Leadership view: drafts and pending revisions are visible here. Revised means an amendment awaiting approval."}
      </p>
      {!objectives.length && (
        <section className={`${panel} py-12 text-center`}>
          <ListTree className="mx-auto mb-3 text-teal-700" aria-hidden="true" />
          <h3 className="font-semibold">
            {session.role === "READER"
              ? "No approved objectives yet"
              : "Your company plan is empty"}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {session.role === "READER"
              ? "Approved objectives and their goals will appear here when they become effective."
              : "Begin with a small number of clear objectives."}
          </p>
        </section>
      )}
      {objectives.map((objective) => {
        const current = objective.current.data;
        const pillar = pillars.find(
          (item) => item.code === current.primaryPillarCode,
        );
        return (
          <article
            key={objective.id}
            id={`objective-${objective.id}`}
            tabIndex={-1}
            className={`${panel} scroll-mt-6 focus-visible:outline-2 focus-visible:outline-teal-600 ${objective.id === highlightObjectiveId ? "ring-2 ring-teal-300" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-slate-500">{objective.code}</span>
              <Status value={objective.current.status} />
              <span className="text-slate-400">
                v{objective.current.number}
              </span>
              {session.canEdit && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {objective.current.status === "Draft" && (
                    <Link
                      href={`${routes.create}?objectiveId=${encodeURIComponent(objective.id)}`}
                      aria-label={`Edit draft: ${current.title || "Untitled objective"}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit draft
                    </Link>
                  )}
                  <Link
                    href={`${routes.goal}?objectiveId=${encodeURIComponent(objective.id)}`}
                    aria-label={`Add Goal: ${current.title || "Untitled objective"}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add Goal
                  </Link>
                </div>
              )}
            </div>
            <h3 className="mt-3 text-lg font-semibold">
              {current.title || "Untitled objective"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {current.meaning || "Meaning has not been added yet."}
            </p>
            <p className="mt-3 text-xs leading-6 text-slate-500">
              {pillar
                ? `${pillar.code} · ${pillar.name}`
                : "Pillar not selected"}{" "}
              ·{" "}
              {employees.find((item) => item.id === current.ownerId)?.name ??
                "Owner not assigned"}{" "}
              ·{" "}
              {periods.find((item) => item.id === current.planningPeriodId)
                ?.name ?? "Planning period not selected"}
            </p>
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="QCDSMT alignment"
            >
              {current.alignments.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-800"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Linked goals ({objective.goals.length})
              </h4>
              {!objective.goals.length && (
                <p className="text-sm text-slate-500">
                  {session.role === "READER"
                    ? "No approved linked goals yet."
                    : "No linked goals yet. One or two focused goals is a good starting point."}
                </p>
              )}
              {objective.goals.map((goal) => (
                <section
                  key={goal.id}
                  id={`goal-${goal.id}`}
                  tabIndex={-1}
                  className={`scroll-mt-6 rounded-lg border border-slate-200 p-4 focus-visible:outline-2 focus-visible:outline-teal-600 ${goal.id === highlightGoalId && objective.id === highlightObjectiveId ? "ring-2 ring-teal-300" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">
                      {goal.code}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Status value={goal.current.status} />
                      {session.canEdit && goal.current.status === "Draft" && (
                        <Link
                          href={`${routes.goal}?objectiveId=${encodeURIComponent(objective.id)}&goalId=${encodeURIComponent(goal.id)}`}
                          aria-label={`Edit goal draft: ${goal.current.data.resultStatement || "Untitled goal"}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Edit goal draft
                        </Link>
                      )}
                    </div>
                  </div>
                  <h5 className="mt-2 text-sm font-semibold leading-6">
                    {goal.current.data.resultStatement || "Untitled goal"}
                  </h5>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Measure: {goal.current.data.measure || "Not defined"}
                  </p>
                  <GoalFacts goal={goal.current.data} employees={employees} />
                  {goal.current.status === "Draft" && (
                    <p className="mt-3 text-xs text-slate-500">
                      SMART readiness:{" "}
                      {
                        smartReadiness(goal.current.data, current, {
                          employees,
                          departments,
                          pillars,
                          planningPeriods: periods,
                        }).filter((check) => check.ready).length
                      }{" "}
                      of 5 checks ready · Draft, not approved
                    </p>
                  )}
                  <p className="mt-4 text-xs font-medium text-slate-500">
                    Contributing departments
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {goal.current.data.contributingDepartmentIds.length ? (
                      goal.current.data.contributingDepartmentIds.map((id) => (
                        <span
                          key={id}
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600"
                        >
                          {departments.find((item) => item.id === id)?.name ??
                            "Unknown department"}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">
                        Not selected
                      </span>
                    )}
                  </div>
                  <History record={goal} employees={employees} />
                </section>
              ))}
            </div>
            <History record={objective} employees={employees} />
          </article>
        );
      })}
    </div>
  );
}
