import { BadRequestException } from "@nestjs/common";
import {
  CalendarRules,
  DIRECTIONS,
  FREQUENCIES,
  RESPONSIBILITIES,
} from "./calendar-model";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Expected a settings object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new BadRequestException(
      `Text values must be no longer than ${max} characters.`,
    );
  return value.trim();
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new BadRequestException(
      `Expected a whole number from ${min} to ${max}.`,
    );
  return value;
}
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new BadRequestException("Unsupported settings choice.");
  return value as T;
}
export const revisionNumber = (value: unknown) => number(value, 0, 2147483646);
export const reasonText = (value: unknown) => text(value ?? "", 1000);

export function parseRules(value: unknown): CalendarRules {
  const r = object(value);
  if (JSON.stringify(r).length > 150000)
    throw new BadRequestException("This calendar draft is too large.");
  if (!Array.isArray(r.workdays) || r.workdays.length > 7)
    throw new BadRequestException("Select normal working days.");
  if (!Array.isArray(r.exceptions) || r.exceptions.length > 1500)
    throw new BadRequestException("Use at most 1,500 calendar exceptions.");
  if (!Array.isArray(r.directions) || r.directions.length > DIRECTIONS.length)
    throw new BadRequestException("Choose measurement types.");
  const responsibilities = object(r.responsibilities);
  return {
    name: text(r.name, 120),
    start: text(r.start, 10),
    end: text(r.end, 10),
    timeZone: text(r.timeZone, 80),
    country: text(r.country, 2).toUpperCase(),
    workdays: [...new Set(r.workdays.map((v) => number(v, 0, 6)))],
    exceptions: r.exceptions.map((value) => {
      const e = object(value);
      return {
        date: text(e.date, 10),
        reason: text(e.reason, 200),
        kind: choice(e.kind, ["WORKING", "NON_WORKING"]),
        source: choice(e.source, ["MANUAL", "HOLIDAY_SUGGESTION"]),
      };
    }),
    weekStart: number(r.weekStart, 0, 6),
    fortnightAnchor: text(r.fortnightAnchor, 10),
    splitDay: number(r.splitDay, 1, 27),
    submissionDays: number(r.submissionDays, 0, 60),
    submissionDayType: choice(r.submissionDayType, ["CALENDAR", "WORKING"]),
    submissionRoll: choice(r.submissionRoll, ["NONE", "NEXT_WORKING"]),
    submissionTime: text(r.submissionTime, 5),
    verificationDays: number(r.verificationDays, 0, 60),
    reviewFrequency: choice(r.reviewFrequency, FREQUENCIES),
    reviewDays: number(r.reviewDays, 0, 60),
    responsibilities: {
      owner: choice(responsibilities.owner, RESPONSIBILITIES),
      provider: choice(responsibilities.provider, RESPONSIBILITIES),
      verifier: choice(responsibilities.verifier, RESPONSIBILITIES),
      approver: choice(responsibilities.approver, RESPONSIBILITIES),
    },
    directions: [...new Set(r.directions.map((v) => choice(v, DIRECTIONS)))],
  };
}
