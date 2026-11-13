"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, CheckCheck, ClipboardList } from "lucide-react";
import { usePlanning } from "./PlanningProvider";
import { PlanningFlowNav } from "./PlanningFlowNav";
import { PlanningYearPicker } from "./PlanningYearPicker";
import { PlanningStrategyMap } from "./PlanningStrategyMap";
import { approvedPlanningCommitments } from "@/services/leadership-excellence/performance-planning/strategy-map";
import { planningToday } from "./PlanningLinks";
import { card, Empty } from "./PlanningUi";

/** Area 03 hands over approved commitments; the shared execution areas own results. */
export function PlanningResultsHandoff() {
  const { data, planningCycle, setPlanningCycle } = usePlanning();
  const cycle =
    planningCycle ||
    data.documents.at(-1)?.cycle ||
    String(new Date().getFullYear());
  const years = [
    ...new Set([cycle, ...data.documents.map((plan) => plan.cycle)]),
  ]
    .sort()
    .reverse();
  const today = planningToday(data.references.timeZone);
  const commitments = approvedPlanningCommitments(data, cycle, today);
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Performance planning
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Approved commitments are ready for execution and independent
            measurement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PlanningStrategyMap cycle={cycle} />
          <PlanningYearPicker
            value={cycle}
            years={years}
            onChange={setPlanningCycle}
          />
        </div>
      </header>
      <PlanningFlowNav active="results" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Results & review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Currently effective company objectives, department goals and
            individual goals retain their own measures.
          </p>
        </div>
        <Link
          href="/leadership-excellence/performance-planning/check-approve"
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
        >
          Check & approve plans <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          [
            ClipboardList,
            "1. Record results",
            "Record the actual value and its evidence against the approved measure.",
          ],
          [
            CheckCheck,
            "2. Verify independently",
            "The assigned verifier checks the source, period and calculation.",
          ],
          [
            BarChart3,
            "3. Review performance",
            "Compare verified results with the target and agree the next action.",
          ],
        ].map(([Icon, title, text]) => {
          const Symbol = Icon as typeof ClipboardList;
          return (
            <section key={String(title)} className={card}>
              <Symbol className="mb-3 text-indigo-600" size={20} />
              <h3 className="text-sm font-semibold">{String(title)}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {String(text)}
              </p>
            </section>
          );
        })}
      </div>
      <p
        className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600"
        role="status"
      >
        Planning handover is ready below. Result entry, verification and
        performance reviews will become available when the shared Execution,
        Monitoring and Review screens are connected. No achievement is inferred
        from an approved plan or from completed contributions.
      </p>
      {commitments.length ? (
        <div className="space-y-3">
          {commitments.map(({ plan, version, goal, itemKind }) => {
            const owner = data.references.people.find(
              (person) => person.id === goal.ownerId,
            );
            const assignments =
              itemKind === "OBJECTIVE"
                ? []
                : version.data.assignments.filter(
                    (item) => item.goalId === goal.id,
                  );
            return (
              <article
                key={`${plan.id}/${itemKind}/${goal.id}/${version.version}`}
                className={card}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {itemKind === "OBJECTIVE"
                      ? "Company objective"
                      : `${plan.kind.toLowerCase()} goal`}{" "}
                    · {goal.code} · Approved v{version.version}
                  </p>
                  <span className="text-xs text-slate-500">
                    Effective{" "}
                    {version.effectiveDate || version.approvedAt.slice(0, 10)}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold">{goal.title}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Baseline → target</p>
                    <p className="mt-1 text-sm">
                      {goal.baseline ?? "Not set"} → {goal.target ?? "Not set"}{" "}
                      {goal.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Owner / deadline</p>
                    <p className="mt-1 text-sm">
                      {owner?.name || "Not assigned"} ·{" "}
                      {goal.endDate || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Verified result</p>
                    <p className="mt-1 text-sm">Not available in planning</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">{goal.measure}</p>
                {!!assignments.length && (
                  <details className="mt-4 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-medium">
                      Reporting responsibilities · {assignments.length} KPI
                      assignment{assignments.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-3 space-y-2">
                      {assignments.map((assignment) => (
                        <p
                          className="text-xs text-slate-500"
                          key={assignment.id}
                        >
                          {assignment.code} · Provider:{" "}
                          {data.references.people.find(
                            (person) => person.id === assignment.providerId,
                          )?.name || "Not assigned"}{" "}
                          · Verifier:{" "}
                          {data.references.people.find(
                            (person) => person.id === assignment.verifierId,
                          )?.name || "Not assigned"}{" "}
                          ·{" "}
                          {assignment.updateFrequency
                            .toLowerCase()
                            .replaceAll("_", " ")}
                        </p>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="No approved commitments for this period">
          Complete and approve a company, department or individual plan. Its
          saved measures and responsibilities will appear here without duplicate
          entry.
        </Empty>
      )}
    </div>
  );
}
