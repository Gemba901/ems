"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LifeBuoy, Play } from "lucide-react";
import type {
  ExecutionGoal,
  ExecutionAssignment,
} from "@/services/leadership-excellence/execution.service";
import {
  displayNumber,
  resultSummary,
  sameGoalReference,
} from "@/services/leadership-excellence/execution/helpers";
import { useExecution } from "./ExecutionProvider";
import { useExecutionScope } from "./ExecutionFrame";
import { ExecutionStatus, Metric } from "./ExecutionUi";
import { Button, card, Empty, Modal } from "../performance-planning/PlanningUi";

const BASE = "/leadership-excellence/execution";
export function ExecutionOverview() {
  const { data } = useExecution();
  const router = useRouter();
  const { goals, assignments, actions, scope, cycle } = useExecutionScope();
  const [selected, setSelected] = useState<string | null>(null);
  const goal = goals.find((g) => g.key === selected);
  const current = assignments.filter((a) => a.current);
  const pending = data.results.filter(
    (r) =>
      r.status === "SUBMITTED" &&
      current.some((a) => a.key === r.assignmentKey),
  );
  const support = data.supportRequests.filter(
    (r) =>
      (goals.some((g) => sameGoalReference(g.key, r.goalKey)) ||
        (scope === "personal" &&
          r.assignedToId === data.actor.employeeId &&
          (!cycle || r.cycle === cycle))) &&
      !["CLOSED", "RESOLVED"].includes(r.status),
  );
  const person = (id: string) =>
    data.references.people.find((p) => p.id === id)?.name || "Not assigned";
  const actionsFor = (entry: ExecutionGoal) =>
    actions.filter(
      (a) => a.goalKey === entry.key || a.action.goalId === entry.item.id,
    );
  if (!goals.length && !current.length && !actions.length && !support.length)
    return (
      <Empty
        title={
          scope === "personal"
            ? "No assigned work yet"
            : "No approved department goals yet"
        }
      >
        Approved goals, KPI assignments and actions from Performance Planning
        will appear here when they become effective. No new plan needs to be
        created in this workspace.
      </Empty>
    );
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Approved goals"
          value={goals.length}
          hint="Your agreed commitments"
        />
        <Metric
          label="Assigned KPIs"
          value={current.length}
          hint="Targets and reporting schedules"
        />
        <Metric
          label="Results awaiting verification"
          value={pending.length}
          hint="Submitted to Area 05"
        />
        <Metric
          label="Open support requests"
          value={support.length}
          hint="Resources, decisions or help needed"
        />
      </div>
      {!goals.length && support.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">Help requested from you</h2>
          <p className="mt-2 text-sm text-slate-500">
            You have {support.length} open support request(s).
          </p>
          <Link
            href={`${BASE}/support-requests?scope=${scope}&cycle=${encodeURIComponent(cycle)}`}
            className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-700"
          >
            Open support requests <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {goals.map((entry) => {
        const linked = current.filter((a) => a.goalKey === entry.key);
        const tasks = actionsFor(entry);
        const overdue = tasks.filter(
          (a) =>
            a.action.dueDate < data.today &&
            data.actionUpdates.find((u) => u.actionKey === a.key)?.status !==
              "COMPLETED",
        );
        return (
          <article key={entry.key} className={card}>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>
                {entry.item.code} ·{" "}
                {entry.kind === "INDIVIDUAL"
                  ? "Individual goal"
                  : "Department goal"}
              </span>
              <span>Approved v{entry.version}</span>
            </div>
            <h2 className="mt-3 text-lg font-semibold">
              <button
                onClick={() => setSelected(entry.key)}
                className="text-left hover:text-indigo-700 hover:underline"
              >
                {entry.item.title} <ArrowRight size={16} className="inline" />
              </button>
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              <span>Owner: {person(entry.item.ownerId)}</span>
              <span>Due {entry.item.endDate || "Not set"}</span>
              <span>
                {tasks.length} actions
                {overdue.length ? ` · ${overdue.length} overdue` : ""}
              </span>
            </div>
            <KpiRows entries={linked} />
            {!linked.length && (
              <p className="mt-4 text-sm text-slate-500">
                No KPI assigned to this approved goal.
              </p>
            )}
          </article>
        );
      })}
      {!goals.length && current.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">Your assigned KPIs</h2>
          <KpiRows entries={current} />
        </section>
      )}
      {!goals.length && actions.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">Your assigned actions</h2>
          <p className="mt-2 text-sm text-slate-500">
            These actions belong to shared approved plans.
          </p>
          <Link
            className="mt-3 inline-flex items-center gap-2 text-sm text-indigo-700"
            href={`${BASE}/delivery-actions?scope=${scope}&cycle=${encodeURIComponent(cycle)}`}
          >
            Open My actions <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {goal && (
        <Modal
          wide
          title="Goal details"
          description={goal.item.title}
          onClose={() => setSelected(null)}
        >
          <div className="space-y-6">
            <div className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
              <Fact title="Owner" value={person(goal.item.ownerId)} />
              <Fact
                title="Target"
                value={`${displayNumber(goal.item.target)} ${goal.item.unit || ""}`}
              />
              <Fact title="From" value={goal.item.startDate} />
              <Fact title="Deadline" value={goal.item.endDate} />
            </div>
            <p className="text-sm text-slate-600">
              <strong>Measure:</strong> {goal.item.measure || "Not specified"}
            </p>
            <ParentChain entry={goal} />
            <section>
              <h3 className="font-semibold">KPIs & performance results</h3>
              <KpiRows
                entries={current.filter((a) => a.goalKey === goal.key)}
              />
            </section>
            <section className="border-t border-slate-200 pt-5">
              <h3 className="font-semibold">Actions & owners</h3>
              <div className="mt-3 space-y-3">
                {actionsFor(goal).map((a) => {
                  const status =
                    data.actionUpdates.find((u) => u.actionKey === a.key)
                      ?.status || "NOT_STARTED";
                  const href = `${BASE}/delivery-actions?scope=${scope}&cycle=${encodeURIComponent(cycle)}&action=${encodeURIComponent(a.key)}`;
                  return (
                    <div
                      key={a.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div>
                        <Link
                          href={href}
                          className="text-sm font-medium text-indigo-700 hover:underline"
                        >
                          {a.action.title}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {person(a.action.ownerId)} · Due {a.action.dueDate}
                        </p>
                      </div>
                      {a.canUpdate && status === "NOT_STARTED" ? (
                        <Button
                          type="button"
                          size="sm"
                          title={`Start ${a.action.title}`}
                          onClick={() => router.push(href)}
                        >
                          <Play size={14} aria-hidden="true" />
                          Start
                        </Button>
                      ) : (
                        <ExecutionStatus status={status} />
                      )}
                    </div>
                  );
                })}
                {!actionsFor(goal).length && (
                  <p className="text-sm text-slate-500">
                    No separate action is linked to this goal.
                  </p>
                )}
              </div>
            </section>
            <section className="border-t border-slate-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Support needs</h3>
                {goal.canRequestSupport && (
                  <Link
                    href={`${BASE}/support-requests?scope=${scope}&cycle=${encodeURIComponent(cycle)}&goal=${encodeURIComponent(goal.key)}`}
                    className="inline-flex items-center gap-1 text-sm text-indigo-700"
                  >
                    <LifeBuoy size={15} />
                    Ask for support
                  </Link>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {data.supportRequests
                  .filter((r) => sameGoalReference(r.goalKey, goal.key))
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"
                    >
                      <Link
                        href={`${BASE}/support-requests?scope=${scope}&cycle=${encodeURIComponent(cycle)}&request=${r.id}`}
                        className="text-sm text-indigo-700 hover:underline"
                      >
                        {r.title}
                      </Link>
                      <ExecutionStatus status={r.status} />
                    </div>
                  ))}
              </div>
            </section>
            <details className="border-t border-slate-200 pt-4 text-sm">
              <summary className="cursor-pointer font-medium">
                People contributing to this goal
              </summary>
              <p className="mt-3">Goal owner: {person(goal.item.ownerId)}</p>
              {current
                .filter((a) => a.goalKey === goal.key)
                .map((a) => (
                  <p key={a.key} className="mt-2 text-slate-600">
                    {a.definition.name} · Reports:{" "}
                    {person(a.assignment.providerId)} · Checks:{" "}
                    {person(a.assignment.verifierId)}
                  </p>
                ))}
            </details>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 font-medium">{value || "Not set"}</p>
    </div>
  );
}
function ParentChain({ entry }: { entry: ExecutionGoal }) {
  const { data } = useExecution();
  const chain: { code: string; title: string; kind: string }[] = [];
  let cursor: ExecutionGoal | undefined = entry;
  const seen = new Set<string>();
  while (cursor?.parent && !seen.has(cursor.key) && chain.length < 4) {
    seen.add(cursor.key);
    chain.unshift(cursor.parent);
    cursor = data.goals.find((g) => g.key === cursor?.parentKey);
  }
  return chain.length ? (
    <section className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-semibold">How this work contributes</h3>
      {chain.map((parent, index) => (
        <div key={`${parent.code}:${index}`} className="mt-3">
          <p className="text-xs text-slate-500">
            {parent.kind.replaceAll("_", " ")} · {parent.code}
          </p>
          <p className="mt-1 text-sm font-medium">{parent.title}</p>
        </div>
      ))}
      <p className="mt-3 text-xs text-slate-500">
        Each goal keeps its own verified measure. Completing an action does not
        change KPI achievement.
      </p>
    </section>
  ) : (
    <p className="text-sm text-slate-500">
      No parent commitment is linked to this approved goal.
    </p>
  );
}
function KpiRows({ entries }: { entries: ExecutionAssignment[] }) {
  const { data } = useExecution();
  const { scope, cycle } = useExecutionScope();
  return (
    <div className="mt-4 divide-y divide-slate-100">
      {entries.map((a) => {
        const summary = resultSummary(a, data.results, data.today);
        return (
          <div
            key={a.key}
            className="grid gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1.8fr)_1fr_1fr]"
          >
            <div>
              <Link
                className="font-medium text-indigo-700 hover:underline"
                href={`${BASE}/results-entry?scope=${scope}&cycle=${encodeURIComponent(cycle)}&assignment=${encodeURIComponent(a.key)}`}
              >
                {a.definition.name} <ArrowRight size={14} className="inline" />
              </Link>
              <p className="mt-1 text-xs text-slate-500">
                {a.periods.length} periods ·{" "}
                {a.assignment.updateFrequency
                  .replaceAll("_", " ")
                  .toLowerCase()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Approved target</p>
              <p className="mt-1">
                {a.assignment.targetMode === "VARIED"
                  ? "Set by period"
                  : `${displayNumber(a.assignment.target)} ${a.definition.unit}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Verified actual</p>
              <p className="mt-1">
                {displayNumber(summary.official)} {a.definition.unit}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
