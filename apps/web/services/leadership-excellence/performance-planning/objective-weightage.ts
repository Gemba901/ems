import type { Pillar } from "./types";

/** Fixed company allocations. These apply to objectives, never to SWOT scores. */
export const PILLAR_BUDGETS: Readonly<Record<Pillar, number>> = Object.freeze({
  LEX: 10,
  PEX: 20,
  OPX: 30,
  CMX: 20,
  SGEX: 10,
  FPEX: 10,
});

export const OBJECTIVE_PILLAR_NAMES: Readonly<Record<Pillar, string>> = {
  LEX: "Leadership",
  PEX: "People",
  OPX: "Operational",
  CMX: "Customer & Market",
  SGEX: "Governance & Sustainability",
  FPEX: "Financial",
};

export function objectiveWeightLimit(pillar: string): number | null {
  return Object.hasOwn(PILLAR_BUDGETS, pillar)
    ? PILLAR_BUDGETS[pillar as Pillar]
    : null;
}

export function validObjectivePriority(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

export function validObjectiveWeightage(
  value: unknown,
  pillar: string,
): value is number {
  const limit = objectiveWeightLimit(pillar);
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    limit !== null &&
    value >= 1 &&
    value <= limit &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  );
}

export function objectiveWeightageMessage(pillar: string) {
  const limit = objectiveWeightLimit(pillar);
  return limit === null
    ? "Choose a primary pillar before assigning objective weightage."
    : `Enter an objective weightage from 1 to ${limit}% for ${pillar}, with up to two decimal places.`;
}

export function formatObjectiveWeight(value: number) {
  return String(value);
}

type WeightedObjective = {
  id?: string;
  pillar: string;
  weightage?: number | null;
};

/** Integer hundredths avoid floating-point errors. No entered value is changed. */
export function objectiveAllocation(
  objectives: readonly WeightedObjective[],
  pillar: Pillar,
) {
  const rows = objectives.filter((objective) => objective.pillar === pillar);
  const target = PILLAR_BUDGETS[pillar];
  const totalUnits = rows.reduce(
    (total, objective) =>
      total +
      (typeof objective.weightage === "number" &&
      Number.isFinite(objective.weightage)
        ? Math.round(objective.weightage * 100)
        : 0),
    0,
  );
  const missing = rows.filter(
    (objective) => objective.weightage == null,
  ).length;
  const invalid = rows.filter(
    (objective) =>
      objective.weightage != null &&
      !validObjectiveWeightage(objective.weightage, pillar),
  ).length;
  const total = totalUnits / 100;
  const delta = (target * 100 - totalUnits) / 100;
  const balanced =
    rows.length > 0 && delta === 0 && missing === 0 && invalid === 0;
  const messages: string[] = [];
  if (!rows.length) {
    messages.push(
      "No objectives in this pillar yet. Add one only if it supports this plan.",
    );
  } else {
    if (delta > 0)
      messages.push(
        `Add ${formatObjectiveWeight(delta)}% across ${pillar} objectives.`,
      );
    if (delta < 0)
      messages.push(
        `Reduce ${formatObjectiveWeight(-delta)}% across ${pillar} objectives.`,
      );
    if (missing)
      messages.push(
        `${missing} objective${missing === 1 ? " has" : "s have"} no weightage yet.`,
      );
    if (invalid)
      messages.push(
        `Correct ${invalid} invalid weightage value${invalid === 1 ? "" : "s"}. Each ${pillar} objective allows 1–${target}%, up to two decimals.`,
      );
    if (balanced) messages.push(`${pillar} is balanced at exactly ${target}%.`);
  }
  return {
    pillar,
    target,
    total,
    delta,
    count: rows.length,
    missing,
    invalid,
    balanced,
    messages,
  };
}
