import type { ExecutionAssignment, ExecutionResult } from "./types";
import type {
  KpiDefinition,
  TargetPeriod,
} from "../performance-planning/types";

/** Support remains attached to the same commitment when its approved version changes. */
export const sameGoalReference = (left: string, right: string) =>
  left.replace(/\/v\d+$/, "") === right.replace(/\/v\d+$/, "");

export const displayNumber = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(value);

/** Empty entries stay missing. Zero is a valid measurement. */
export function inputNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function actualValue(
  definition: KpiDefinition,
  inputA: number | null,
  inputB: number | null,
): number | null {
  if (inputA == null) return null;
  if (definition.formula === "DIRECT") return inputA;
  if (inputB == null || inputB <= 0) return null;
  return (inputA / inputB) * (definition.formula === "PERCENT" ? 100 : 1);
}

export function aggregateResults(
  definition: KpiDefinition,
  entries: {
    actual: number;
    inputA: number | null;
    inputB: number | null;
    end: string;
  }[],
): number | null {
  if (!entries.length) return null;
  const ordered = [...entries].sort((a, b) => a.end.localeCompare(b.end));
  if (
    definition.aggregation === "CLOSING" ||
    definition.aggregation === "MILESTONE"
  )
    return ordered.at(-1)!.actual;
  if (definition.aggregation === "RATIO" || definition.formula !== "DIRECT") {
    if (entries.some((entry) => entry.inputA == null || entry.inputB == null))
      return null;
    const numerator = entries.reduce((sum, entry) => sum + entry.inputA!, 0);
    const denominator = entries.reduce((sum, entry) => sum + entry.inputB!, 0);
    return denominator > 0
      ? (numerator / denominator) * (definition.formula === "PERCENT" ? 100 : 1)
      : null;
  }
  return entries.reduce((sum, entry) => sum + entry.actual, 0);
}

export function resultSummary(
  assignment: ExecutionAssignment,
  results: ExecutionResult[],
  today: string,
  periods = assignment.periods,
) {
  const byPeriod = new Map(
    results
      .filter((r) => r.assignmentKey === assignment.key)
      .map((r) => [r.periodId, r]),
  );
  const scheduled = periods.filter((p) => p.scheduled !== false);
  const elapsed = scheduled.filter((p) => p.end <= today);
  const official = scheduled.flatMap((period) => {
    const result = byPeriod.get(period.id);
    return result?.official ? [{ ...result.official, end: period.end }] : [];
  });
  const provisional = scheduled.flatMap((period) => {
    const result = byPeriod.get(period.id);
    if (result?.status === "SUBMITTED" && result.actual != null)
      return [
        {
          actual: result.actual,
          inputA: result.inputA,
          inputB: result.inputB,
          end: period.end,
        },
      ];
    return result?.official
      ? [
          {
            actual: result.official.actual,
            inputA: result.official.inputA,
            inputB: result.official.inputB,
            end: period.end,
          },
        ]
      : [];
  });
  return {
    official: aggregateResults(assignment.definition, official),
    provisional: aggregateResults(assignment.definition, provisional),
    verified: official.length,
    submitted: scheduled.filter(
      (p) => byPeriod.get(p.id)?.status === "SUBMITTED",
    ).length,
    overdue: scheduled.filter(
      (p) =>
        (p.submissionDate || p.end) < today &&
        p.start <= today &&
        !byPeriod.get(p.id)?.official &&
        byPeriod.get(p.id)?.status !== "SUBMITTED",
    ).length,
    elapsed: elapsed.length,
    scheduled: scheduled.length,
  };
}

export function editablePeriod(
  assignment: ExecutionAssignment,
  period: TargetPeriod,
  today: string,
  result?: ExecutionResult,
  allResults: ExecutionResult[] = [],
) {
  const identity = (key: string) => key.replace(/\/v\d+$/, "");
  const collision = allResults.some(
    (r) =>
      r.periodId === period.id &&
      r.assignmentKey !== assignment.key &&
      identity(r.assignmentKey) === identity(assignment.key),
  );
  return (
    assignment.canEnter &&
    period.scheduled !== false &&
    period.start <= today &&
    result?.status !== "SUBMITTED" &&
    !collision &&
    (!!result || assignment.entryPeriodIds.includes(period.id))
  );
}

export interface ResultInput {
  inputA: string;
  inputB: string;
  note: string;
  evidence: string;
}
export function entryInputs(result?: ExecutionResult): ResultInput {
  return {
    inputA: result?.inputA == null ? "" : String(result.inputA),
    inputB: result?.inputB == null ? "" : String(result.inputB),
    note: result?.note || "",
    evidence: result?.evidence || "",
  };
}

/** Paste is atomic: show every row error before applying any values to the form. */
export function parseResultPaste(
  text: string,
  assignment: ExecutionAssignment,
  today: string,
  results: ExecutionResult[],
) {
  const rows = text.trim()
    ? text
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => line.split("\t"))
    : [];
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const date = cells[0].trim();
    const period = assignment.periods.find((p) => p.start === date);
    const ratio = assignment.definition.formula !== "DIRECT";
    const numericValues = [cells[1], ...(ratio ? [cells[2]] : [])];
    let error = "";
    if (!period) error = "Use a reporting period start date from this KPI.";
    else if (seen.has(period.id))
      error = "This reporting period appears twice.";
    else if (
      !editablePeriod(
        assignment,
        period,
        today,
        results.find(
          (r) => r.assignmentKey === assignment.key && r.periodId === period.id,
        ),
        results,
      )
    )
      error =
        "This period is locked, in the future, not scheduled or belongs to another approved version.";
    else if (
      numericValues.some(
        (value) =>
          value !== undefined &&
          value.trim() &&
          !Number.isFinite(Number(value)),
      )
    )
      error = "Enter valid numbers.";
    else if (ratio && cells[2]?.trim() && Number(cells[2]) <= 0)
      error = "The denominator must be greater than zero.";
    else if (cells.length > (ratio ? 5 : 4))
      error = "Too many columns. Use the format shown above.";
    if (period) seen.add(period.id);
    return {
      line: index + 1,
      date,
      periodId: period?.id || "",
      error,
      inputs: {
        inputA: cells[1]?.trim() || "",
        inputB: ratio ? cells[2]?.trim() || "" : "",
        evidence: cells[ratio ? 3 : 2]?.trim() || "",
        note: cells[ratio ? 4 : 3]?.trim() || "",
      },
    };
  });
}
