"use client";

import { useState, type ReactNode } from "react";
import { usePlanning } from "./PlanningProvider";
import { PlanningFlowNav } from "./PlanningFlowNav";
import { PlanningYearPicker } from "./PlanningYearPicker";
import { PlanningStrategyMap } from "./PlanningStrategyMap";
import { Button, Modal } from "./PlanningUi";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import "./planning-programme.css";

export function useProgrammePeriod() {
  const { data, planningCycle, setPlanningCycle } = usePlanning();
  const cycle =
    planningCycle ||
    data.documents.at(-1)?.cycle ||
    String(new Date().getFullYear());
  const periods = [
    ...new Set([cycle, ...data.documents.map((plan) => plan.cycle)]),
  ]
    .sort()
    .reverse();
  return { cycle, periods, setCycle: setPlanningCycle };
}

export function PlanningProgrammeFrame({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const { data } = usePlanning();
  const { cycle, periods, setCycle } = useProgrammePeriod();
  const [directionOpen, setDirectionOpen] = useState(false);
  const direction = data.references.direction;
  return (
    <div className="planning-programme mx-auto w-full min-w-0 max-w-[1530px] space-y-[22px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Performance planning</h1>
          <p className="mt-2 text-[13px] text-slate-500">
            Understand the finding. Agree the response. Turn it into measurable
            progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PlanningYearPicker
            value={cycle}
            years={periods}
            onChange={setCycle}
          />
          <Button variant="outline" onClick={() => setDirectionOpen(true)}>
            Company direction
          </Button>
          <PlanningStrategyMap cycle={cycle} />
        </div>
      </header>
      <PlanningFlowNav active={active} />
      {children}
      {directionOpen && (
        <Modal
          title="Company direction & planning period"
          onClose={() => setDirectionOpen(false)}
          footer={
            <Button variant="outline" onClick={() => setDirectionOpen(false)}>
              Close
            </Button>
          }
        >
          <p className="programme-callout">
            The approved company direction is shared from Strategic Direction.
            Your selected planning period is {planningPeriodLabel(cycle)}.
          </p>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              ["Company", direction?.company],
              ["Mission", direction?.mission],
              ["Vision", direction?.vision],
              [
                "Values",
                direction?.values?.map((value) => value.name).join(" · "),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-2 whitespace-pre-wrap text-sm">
                  {value ||
                    "Not available from the approved company direction yet."}
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </div>
  );
}
