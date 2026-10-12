"use client";

import React, { useId, useMemo } from "react";
import DwmsSelectDropdown from "../DwmsSelectDropdown";
import type {
  DwmsRecurringSchedule,
  DwmsRecurrenceUnit,
  DwmsWeekday,
} from "@/services/dwms.service";

const WEEKDAYS: Array<{ value: DwmsWeekday; label: string; day: number }> = [
  { value: "MON", label: "Mon", day: 1 },
  { value: "TUE", label: "Tue", day: 2 },
  { value: "WED", label: "Wed", day: 3 },
  { value: "THU", label: "Thu", day: 4 },
  { value: "FRI", label: "Fri", day: 5 },
  { value: "SAT", label: "Sat", day: 6 },
  { value: "SUN", label: "Sun", day: 0 },
];

function dayNumber(code: DwmsWeekday) {
  return WEEKDAYS.find((day) => day.value === code)?.day ?? -1;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isPatternDate(schedule: DwmsRecurringSchedule, date: Date) {
  const start = new Date(`${schedule.startsOn}T00:00:00.000Z`);
  const dayDiff = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  if (dayDiff < 0) return false;
  if (schedule.unit === "DAY") return dayDiff % schedule.interval === 0;
  if (schedule.unit === "WEEK") {
    const startMonday = addDays(start, -((start.getUTCDay() + 6) % 7));
    const dateMonday = addDays(date, -((date.getUTCDay() + 6) % 7));
    const weekDiff = Math.floor(
      (dateMonday.getTime() - startMonday.getTime()) / (7 * 86_400_000),
    );
    return (
      weekDiff % schedule.interval === 0 &&
      (schedule.weekdays ?? []).some(
        (weekday) => dayNumber(weekday) === date.getUTCDay(),
      )
    );
  }
  const monthDiff =
    (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    start.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return (
    monthDiff >= 0 &&
    monthDiff % schedule.interval === 0 &&
    date.getUTCDate() === Math.min(schedule.dayOfMonth ?? 1, lastDay)
  );
}

export function recurrenceSummary(schedule: DwmsRecurringSchedule | null) {
  if (!schedule) return "Once";
  if (schedule.unit === "DAY") {
    return schedule.interval === 1
      ? "Every day"
      : `Every ${schedule.interval} days`;
  }
  if (schedule.unit === "WEEK") {
    const days = WEEKDAYS.filter((day) =>
      schedule.weekdays?.includes(day.value),
    ).map((day) => day.label);
    return schedule.interval === 1
      ? `Every ${days.join(", ")}`
      : `Every ${schedule.interval} weeks on ${days.join(", ")}`;
  }
  return schedule.interval === 1
    ? `Every month on day ${schedule.dayOfMonth}`
    : `Every ${schedule.interval} months on day ${schedule.dayOfMonth}`;
}

type Props = {
  value: DwmsRecurringSchedule | null;
  onChange: (value: DwmsRecurringSchedule | null) => void;
  today: string;
  allowOnce?: boolean;
  workingDays?: number[];
  isClosedDate?: (dateKey: string) => boolean;
};

export default function RecurrenceBuilder({
  value,
  onChange,
  today,
  allowOnce = false,
  workingDays = [1, 2, 3, 4, 5],
  isClosedDate,
}: Props) {
  const fieldId = useId();
  const preview = useMemo(() => {
    if (!value) return [];
    const results = new Set<string>();
    let cursor = new Date(`${value.startsOn}T00:00:00.000Z`);
    for (
      let searched = 0;
      searched < 50_000 && results.size < 5;
      searched += 1
    ) {
      if (isPatternDate(value, cursor)) {
        let adjusted = new Date(cursor);
        while (
          !workingDays.includes(adjusted.getUTCDay()) ||
          isClosedDate?.(dateKey(adjusted))
        ) {
          adjusted = addDays(adjusted, 1);
        }
        results.add(dateKey(adjusted));
      }
      cursor = addDays(cursor, 1);
    }
    return [...results];
  }, [isClosedDate, value, workingDays]);

  function setUnit(unit: DwmsRecurrenceUnit) {
    const start = value?.startsOn ?? today;
    onChange({
      kind: "RECURRING",
      startsOn: start,
      unit,
      interval: value?.interval ?? 1,
      ...(unit === "WEEK"
        ? { weekdays: value?.weekdays?.length ? value.weekdays : ["MON"] }
        : {}),
      ...(unit === "MONTH"
        ? {
            dayOfMonth:
              value?.dayOfMonth ??
              new Date(`${start}T00:00:00.000Z`).getUTCDate(),
          }
        : {}),
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-slate-50 p-4 text-base">
        <span>{value ? "Repeat every" : "Repeat"}</span>
        {value && (
          <input
            aria-label="Repeat interval"
            type="number"
            min={1}
            max={99}
            step={1}
            value={value.interval}
            onChange={(event) =>
              onChange({
                ...value,
                interval: Math.min(99, Math.max(1, Number(event.target.value))),
              })
            }
            className="h-11 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        )}
        <DwmsSelectDropdown
          ariaLabel="Repeat frequency"
          value={value?.unit ?? "ONCE"}
          onChange={(unit) => {
            if (unit === "ONCE") onChange(null);
            else setUnit(unit as DwmsRecurrenceUnit);
          }}
          options={[
            ...(allowOnce ? [{ value: "ONCE", label: "Once" }] : []),
            { value: "DAY", label: "days" },
            { value: "WEEK", label: "weeks" },
            { value: "MONTH", label: "months" },
          ]}
          placeholder="Frequency"
          className="w-32 shrink-0"
          triggerClassName="h-11 rounded-lg text-base sm:rounded-lg"
        />
      </div>

      {value?.unit === "WEEK" && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium text-slate-600">
            Repeat on
          </legend>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((weekday) => {
              const selected = value.weekdays?.includes(weekday.value) ?? false;
              return (
                <button
                  key={weekday.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    const next = selected
                      ? (value.weekdays ?? []).filter(
                          (day) => day !== weekday.value,
                        )
                      : [...(value.weekdays ?? []), weekday.value];
                    if (next.length) onChange({ ...value, weekdays: next });
                  }}
                  className={`min-h-11 min-w-0 rounded-full border py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"}`}
                >
                  {weekday.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {value?.unit === "MONTH" && (
        <label className="mt-5 block max-w-48">
          <span className="mb-1 block text-xs font-semibold text-slate-600">
            Day of month
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={value.dayOfMonth ?? 1}
            onChange={(event) =>
              onChange({
                ...value,
                dayOfMonth: Math.min(
                  31,
                  Math.max(1, Number(event.target.value)),
                ),
              })
            }
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Short months use their final calendar day.
          </span>
        </label>
      )}

      {value && (
        <label htmlFor={`${fieldId}-start`} className="mt-5 block max-w-60">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">
            Starts on
          </span>
          <input
            id={`${fieldId}-start`}
            type="date"
            min={today}
            value={value.startsOn}
            onChange={(event) => {
              if (event.target.value)
                onChange({ ...value, startsOn: event.target.value });
            }}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      )}

      <div className="mt-5 rounded-xl bg-blue-50 p-4" aria-live="polite">
        <p className="font-semibold text-slate-800">
          {recurrenceSummary(value)}
        </p>
        {preview.length > 0 && (
          <>
            <p className="mt-2 text-xs font-medium text-slate-600">
              Next {preview.length} dates
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.map((date) => {
                const previewDate = new Date(`${date}T00:00:00.000Z`);
                return (
                  <time
                    key={date}
                    dateTime={date}
                    aria-label={previewDate.toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                    className="flex min-w-14 flex-col rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center"
                  >
                    <span className="text-xs text-slate-500">
                      {previewDate.toLocaleDateString("en-GB", {
                        weekday: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {previewDate.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                  </time>
                );
              })}
            </div>
          </>
        )}
      </div>
      {value && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Working-day adjustments</summary>
          <p className="mt-2">
            Closed dates move to the next open day. Dates landing on the same
            day are combined.
          </p>
        </details>
      )}
    </div>
  );
}
