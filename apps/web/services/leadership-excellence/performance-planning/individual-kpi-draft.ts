import type { Assignment, PlanningCalendar, TargetPeriod } from "./types";

export type ProgrammeTargetDraft = Omit<TargetPeriod, "target" | "upper"> & {
  target: string;
  upper: string;
  badTarget?: boolean;
  badUpper?: boolean;
};

export type ProgrammeAssignmentDraftRow = {
  key: string;
  id?: string;
  data: Record<string, unknown>;
  badNumbers?: Record<string, boolean>;
  savedCalendar?: PlanningCalendar;
  savedTargets?: ProgrammeTargetDraft[];
};

const raw = (value: unknown) => (value == null ? "" : String(value));
const clone = <T>(value: T): T => structuredClone(value);

export function assignmentDraftPeriods(
  row: ProgrammeAssignmentDraftRow,
): ProgrammeTargetDraft[] {
  return Array.isArray(row.data.targets)
    ? (row.data.targets as ProgrammeTargetDraft[])
    : [];
}

/** Raw strings let a draft distinguish an empty value, zero and bad numeric input. */
export function initAssignmentRows(
  assignments: Assignment[],
): ProgrammeAssignmentDraftRow[] {
  return assignments.map((assignment) => {
    const targets = assignment.targets.map((period) => ({
      ...period,
      target: period.scheduled === false ? "" : raw(period.target),
      upper: period.scheduled === false ? "" : raw(period.upper),
    }));
    return {
      key: assignment.id,
      id: assignment.id,
      data: {
        ...clone(assignment),
        baseline: raw(assignment.baseline),
        target: raw(assignment.target),
        upper: raw(assignment.upper),
        targets,
      },
      badNumbers: {},
      savedCalendar: assignment.calendar
        ? clone(assignment.calendar)
        : undefined,
      savedTargets: clone(targets),
    };
  });
}

/** API dates and scheduling win. Only unchanged periods retain entered values. */
export function mergeAssignmentPeriods(
  previous: ProgrammeTargetDraft[],
  generated: TargetPeriod[],
): ProgrammeTargetDraft[] {
  return generated.map((period) => {
    const old = previous.find(
      (item) =>
        item.id === period.id &&
        item.start === period.start &&
        item.end === period.end,
    );
    return {
      ...period,
      target: period.scheduled === false ? "" : raw(old?.target),
      upper: period.scheduled === false ? "" : raw(old?.upper),
      badTarget: period.scheduled === false ? false : old?.badTarget || false,
      badUpper: period.scheduled === false ? false : old?.badUpper || false,
    };
  });
}

function numberOrNull(
  value: unknown,
  badInput: boolean | undefined,
  label: string,
) {
  const input = raw(value).trim();
  if (badInput || (input !== "" && !Number.isFinite(Number(input))))
    throw new Error(
      `${label}: enter a valid number, or leave it blank for a draft.`,
    );
  return input === "" ? null : Number(input);
}

/** Pure payload conversion; IDs stay references to the existing shared library. */
export function serializeAssignmentRows(rows: ProgrammeAssignmentDraftRow[]) {
  return rows.map((row, index) => {
    const label = `KPI ${index + 1}`;
    const calendar =
      row.data.calendar && typeof row.data.calendar === "object"
        ? { ...(row.data.calendar as Record<string, unknown>) }
        : undefined;
    if (calendar) {
      for (const key of [
        "weekStart",
        "twiceMonthlySplit",
        "submissionDueDays",
      ]) {
        if (calendar[key] !== undefined) {
          const number = numberOrNull(
            calendar[key],
            row.badNumbers?.[`calendar.${key}`],
            `${label}, reporting calendar`,
          );
          if (number === null)
            throw new Error(
              `${label}: complete the reporting calendar setting, or restore its saved value.`,
            );
          calendar[key] = number;
        }
      }
    }
    const data: Record<string, unknown> &
      Pick<Assignment, "baseline" | "target" | "upper" | "targets"> = {
      ...row.data,
      baseline: numberOrNull(
        row.data.baseline,
        row.badNumbers?.baseline,
        `${label}, baseline`,
      ),
      target: numberOrNull(
        row.data.target,
        row.badNumbers?.target,
        `${label}, target`,
      ),
      upper: numberOrNull(
        row.data.upper,
        row.badNumbers?.upper,
        `${label}, upper limit`,
      ),
      ...(calendar ? { calendar } : {}),
      targets: assignmentDraftPeriods(row).map((period) => {
        const { badTarget, badUpper, ...saved } = period;
        return {
          ...saved,
          target:
            period.scheduled === false
              ? null
              : numberOrNull(
                  period.target,
                  badTarget,
                  `${label}, target for ${period.label}`,
                ),
          upper:
            period.scheduled === false
              ? null
              : numberOrNull(
                  period.upper,
                  badUpper,
                  `${label}, upper limit for ${period.label}`,
                ),
        };
      }),
    };
    return { ...(row.id ? { id: row.id } : {}), data };
  });
}
