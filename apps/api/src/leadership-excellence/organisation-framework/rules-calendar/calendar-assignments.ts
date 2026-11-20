import type {
  CalendarAudience,
  CalendarAssignmentResult,
  CalendarComparison,
  CalendarDirectory,
  AudienceConflict,
} from "./calendar-audience.types";
import type { CalendarRules } from "./calendar-model";
import {
  audienceLabel,
  audiencePriority,
  emptyAudience,
} from "./calendar-audience";
import { addDays, dayStatus, validDate } from "./calendar-engine";
export interface PublishedCalendar {
  id: string;
  version: number;
  rules: CalendarRules;
}
export function validateAudienceReferences(
  a: CalendarAudience | undefined,
  directory: CalendarDirectory,
): string[] {
  if (!a) return [];
  const departments = new Set(directory.departments.map((d) => d.id)),
    people = new Set(directory.people.map((p) => p.id));
  const missingDepartments = a.departmentIds.filter(
    (id) => !departments.has(id),
  ).length;
  const missingPeople = a.employeeIds.filter((id) => !people.has(id)).length;
  return [
    missingDepartments
      ? `${missingDepartments} selected department(s) are no longer available in this company. Review the assignment.`
      : "",
    missingPeople
      ? `${missingPeople} selected person/people are no longer available in this company. Review the group membership.`
      : "",
  ].filter(Boolean);
}
export function assignmentConflicts(
  rules: CalendarRules,
  currentId: string | undefined,
  published: PublishedCalendar[],
): AudienceConflict[] {
  const a = rules.audience ?? emptyAudience();
  if (!audiencePriority(a) || !validDate(rules.start) || !validDate(rules.end))
    return [];
  return published.flatMap((c) => {
    if (
      c.id === currentId ||
      c.rules.start > rules.end ||
      c.rules.end < rules.start ||
      audiencePriority(c.rules.audience) !== audiencePriority(a)
    )
      return [];
    const b = c.rules.audience ?? emptyAudience();
    const overlaps =
      a.kind === "COMPANY" ||
      (a.kind === "DEPARTMENTS" &&
        a.departmentIds.some((id) => b.departmentIds.includes(id))) ||
      (a.kind === "PEOPLE" &&
        a.employeeIds.some((id) => b.employeeIds.includes(id)));
    return overlaps
      ? [
          {
            calendarId: c.id,
            version: c.version,
            name: c.rules.name,
            start: c.rules.start > rules.start ? c.rules.start : rules.start,
            end: c.rules.end < rules.end ? c.rules.end : rules.end,
            message:
              "Overlaps another approved assignment at the same level. Change the people/departments or dates, or revise the existing calendar.",
          },
        ]
      : [];
  });
}
export function audienceMatches(
  a: CalendarAudience | undefined,
  person: CalendarDirectory["people"][number],
) {
  return (
    a?.kind === "COMPANY" ||
    (a?.kind === "DEPARTMENTS" &&
      !!person.departmentId &&
      a.departmentIds.includes(person.departmentId)) ||
    (a?.kind === "PEOPLE" && a.employeeIds.includes(person.id))
  );
}
function assignmentIndex(calendars: PublishedCalendar[]) {
  const company: PublishedCalendar[] = [],
    departments = new Map<string, PublishedCalendar[]>(),
    people = new Map<string, PublishedCalendar[]>();
  for (const c of calendars) {
    const a = c.rules.audience;
    if (a?.kind === "COMPANY") company.push(c);
    if (a?.kind === "DEPARTMENTS")
      for (const id of a.departmentIds)
        departments.set(id, [...(departments.get(id) ?? []), c]);
    if (a?.kind === "PEOPLE")
      for (const id of a.employeeIds)
        people.set(id, [...(people.get(id) ?? []), c]);
  }
  return (
    p: CalendarDirectory["people"][number],
    date: string,
  ): CalendarAssignmentResult => {
    if (!p.active)
      return {
        status: "INACTIVE",
        basis: "CURRENT_PEOPLE_RECORDS",
        candidates: [],
      };
    for (const list of [
      people.get(p.id) ?? [],
      departments.get(p.departmentId ?? "") ?? [],
      company,
    ]) {
      const available = list.filter(
        (c) => c.rules.start <= date && c.rules.end >= date,
      );
      if (!available.length) continue;
      const candidates = available.map((c) => ({
        calendarId: c.id,
        version: c.version,
        name: c.rules.name,
      }));
      return available.length === 1
        ? {
            status: "ASSIGNED",
            basis: "CURRENT_PEOPLE_RECORDS",
            calendarId: available[0].id,
            version: available[0].version,
            candidates,
          }
        : { status: "CONFLICT", basis: "CURRENT_PEOPLE_RECORDS", candidates };
    }
    return {
      status: "UNASSIGNED",
      basis: "CURRENT_PEOPLE_RECORDS",
      candidates: [],
    };
  };
}
export function currentAssignment(
  person: CalendarDirectory["people"][number],
  date: string,
  calendars: PublishedCalendar[],
) {
  if (!validDate(date))
    throw new Error("Choose a valid date for the calendar assignment.");
  return assignmentIndex(calendars)(person, date);
}
export function compareCalendars(
  month: string,
  directory: CalendarDirectory,
  calendars: PublishedCalendar[],
): CalendarComparison {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !validDate(`${month}-01`) ||
    month < "1900-01" ||
    month > "2199-12"
  )
    throw new Error(
      "Choose a comparison month between January 1900 and December 2199.",
    );
  const dates: string[] = [];
  for (
    let date = `${month}-01`;
    date.startsWith(month);
    date = addDays(date, 1)
  )
    dates.push(date);
  const relevant = calendars.filter(
    (c) => c.rules.start <= dates.at(-1)! && c.rules.end >= dates[0],
  );
  const active = directory.people.filter((p) => p.active),
    resolve = assignmentIndex(relevant);
  const counts = new Map<string, { effective: number; conflicts: number }>();
  const days = dates.map((date) => {
    let assigned = 0,
      conflicts = 0,
      unassigned = 0;
    for (const p of active) {
      const result = resolve(p, date);
      if (result.status === "ASSIGNED") assigned++;
      else if (result.status === "CONFLICT") conflicts++;
      else unassigned++;
      for (const c of result.candidates) {
        const key = `${c.calendarId}:${date}`,
          count = counts.get(key) ?? { effective: 0, conflicts: 0 };
        if (result.status === "ASSIGNED") count.effective++;
        else count.conflicts++;
        counts.set(key, count);
      }
    }
    return { date, assigned, conflicts, unassigned };
  });
  return {
    month,
    basis: "CURRENT_PEOPLE_RECORDS",
    generatedAt: new Date().toISOString(),
    activePeople: active.length,
    days,
    rows: relevant
      .map((c) => {
        const a = c.rules.audience ?? emptyAudience();
        const known = new Set(directory.people.map((p) => p.id));
        const departments = new Set(directory.departments.map((d) => d.id));
        return {
          calendarId: c.id,
          version: c.version,
          name: c.rules.name,
          audience: audienceLabel(a),
          kind: a.kind,
          start: c.rules.start,
          end: c.rules.end,
          country: c.rules.country,
          timeZone: c.rules.timeZone,
          matchingActive: active.filter((p) => audienceMatches(a, p)).length,
          missingMembers:
            a.employeeIds.filter((id) => !known.has(id)).length +
            a.departmentIds.filter((id) => !departments.has(id)).length,
          cells: dates.map((date) => {
            const inCycle = date >= c.rules.start && date <= c.rules.end;
            const status = inCycle ? dayStatus(c.rules, date) : null;
            const count = counts.get(`${c.id}:${date}`);
            return {
              date,
              working: status?.working ?? null,
              reason: status
                ? status.reason || "Regular working day"
                : "Outside this cycle",
              effectivePeople: count?.effective ?? 0,
              conflicts: count?.conflicts ?? 0,
            };
          }),
        };
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.calendarId.localeCompare(b.calendarId),
      ),
  };
}
