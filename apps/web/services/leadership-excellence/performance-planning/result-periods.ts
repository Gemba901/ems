import type { Frequency, TargetPeriod } from "./types";

export interface ResultSchedule {
  version: number;
  effectiveDate: string;
  frequency: Frequency | "";
  target: number | null;
  unit: string;
  calendarSource: "AREA_02" | "WORK_SETTINGS" | "LEGACY";
  calendarVersion: string | number | null;
  periods: (TargetPeriod & { canRecord: boolean })[];
}

/** Keep the server-selected version beside each selectable period. */
export function resultPeriodOptions(schedules: ResultSchedule[]) {
  return schedules
    .flatMap((schedule) =>
      schedule.periods.map((period) => ({
        ...period,
        key: `${schedule.version}/${period.id}`,
        version: schedule.version,
        unit: schedule.unit,
        frequency: schedule.frequency,
      })),
    )
    .sort((a, b) => b.start.localeCompare(a.start) || b.version - a.version);
}
