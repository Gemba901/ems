import { parseAudience } from "./calendar-audience";
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
    ...(r.audience !== undefined
      ? {
          audience: (() => {
            try {
              return parseAudience(r.audience);
            } catch (e) {
              throw new BadRequestException(
                e instanceof Error ? e.message : "Invalid calendar assignment.",
              );
            }
          })(),
        }
      : {}),
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
        kind: choice(e.kind, ["WORKING", "NON_WORKING"] as const),
        source: choice(e.source, ["MANUAL", "HOLIDAY_SUGGESTION"] as const),
      };
    }),
    ...(r.enabledFrequencies !== undefined
      ? {
          enabledFrequencies: (() => {
            if (
              !Array.isArray(r.enabledFrequencies) ||
              !r.enabledFrequencies.length ||
              r.enabledFrequencies.length > FREQUENCIES.length
            )
              throw new BadRequestException(
                "Choose at least one available reporting frequency.",
              );
            return [
              ...new Set(
                r.enabledFrequencies.map((v) => choice(v, FREQUENCIES)),
              ),
            ];
          })(),
        }
      : {}),
    ...(r.customInterval !== undefined
      ? {
          customInterval: (() => {
            const c = object(r.customInterval);
            return {
              every: number(c.every, 1, 365),
              unit: choice(c.unit, ["DAYS", "WEEKS", "MONTHS"] as const),
              anchor: text(c.anchor, 10),
            };
          })(),
        }
      : {}),
    ...(r.twoMonthAnchor !== undefined
      ? { twoMonthAnchor: text(r.twoMonthAnchor, 10) }
      : {}),
    ...(r.verificationBasis !== undefined
      ? {
          verificationBasis: choice(r.verificationBasis, [
            "SUBMISSION_DEADLINE",
            "ACTUAL_SUBMISSION",
          ] as const),
        }
      : {}),
    ...(r.verificationDayType !== undefined
      ? {
          verificationDayType: choice(r.verificationDayType, [
            "CALENDAR",
            "WORKING",
          ] as const),
        }
      : {}),
    ...(r.verificationRoll !== undefined
      ? {
          verificationRoll: choice(r.verificationRoll, [
            "NONE",
            "NEXT_WORKING",
          ] as const),
        }
      : {}),
    ...(r.reviewDayType !== undefined
      ? {
          reviewDayType: choice(r.reviewDayType, [
            "CALENDAR",
            "WORKING",
          ] as const),
        }
      : {}),
    ...(r.reviewRoll !== undefined
      ? { reviewRoll: choice(r.reviewRoll, ["NONE", "NEXT_WORKING"] as const) }
      : {}),
    ...(r.holidayOmissions !== undefined
      ? {
          holidayOmissions: (() => {
            if (
              !Array.isArray(r.holidayOmissions) ||
              r.holidayOmissions.length > 1500
            )
              throw new BadRequestException(
                "Use at most 1,500 holiday decisions.",
              );
            return r.holidayOmissions.map((v) => {
              const h = object(v);
              return {
                date: text(h.date, 10),
                name: text(h.name, 200),
                country: text(h.country, 2),
                reason: text(h.reason, 300),
              };
            });
          })(),
        }
      : {}),
    weekStart: number(r.weekStart, 0, 6),
    fortnightAnchor: text(r.fortnightAnchor, 10),
    splitDay: number(r.splitDay, 1, 27),
    submissionDays: number(r.submissionDays, 0, 60),
    submissionDayType: choice(r.submissionDayType, [
      "CALENDAR",
      "WORKING",
    ] as const),
    submissionRoll: choice(r.submissionRoll, ["NONE", "NEXT_WORKING"] as const),
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
