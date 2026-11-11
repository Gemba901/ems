import type { CalendarAudience } from "./calendar-audience.types";
export const MAX_AUDIENCE_MEMBERS = 3000;
export function emptyAudience(): CalendarAudience {
  return { kind: "UNASSIGNED", label: "", departmentIds: [], employeeIds: [] };
}
export function parseAudience(value: unknown): CalendarAudience {
  if (value === undefined) return emptyAudience();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Choose who uses this calendar.");
  const r = value as Record<string, unknown>;
  if (
    !["UNASSIGNED", "COMPANY", "DEPARTMENTS", "PEOPLE"].includes(String(r.kind))
  )
    throw new Error("Unsupported calendar assignment type.");
  if (typeof r.label !== "string" || r.label.length > 80)
    throw new Error("Use an assignment name of at most 80 characters.");
  function ids(value: unknown) {
    if (
      !Array.isArray(value) ||
      value.length > MAX_AUDIENCE_MEMBERS ||
      value.some((x) => typeof x !== "string" || !x.trim() || x.length > 100)
    )
      throw new Error(
        `Select at most ${MAX_AUDIENCE_MEMBERS} recorded departments or people.`,
      );
    return [...new Set((value as string[]).map((x) => x.trim()))];
  }
  const departmentIds = ids(r.departmentIds),
    employeeIds = ids(r.employeeIds);
  if (
    (r.kind !== "DEPARTMENTS" && departmentIds.length) ||
    (r.kind !== "PEOPLE" && employeeIds.length)
  )
    throw new Error(
      "Remove selections that do not belong to this assignment type.",
    );
  return {
    kind: r.kind as CalendarAudience["kind"],
    label: r.label.trim(),
    departmentIds,
    employeeIds,
  };
}
export function audienceLabel(value?: CalendarAudience) {
  const a = value ?? emptyAudience();
  return (
    a.label ||
    {
      UNASSIGNED: "Not assigned automatically",
      COMPANY: "Company default",
      DEPARTMENTS: "Selected departments",
      PEOPLE: "Named group",
    }[a.kind]
  );
}
export function audienceIssue(value?: CalendarAudience): string {
  const a = value ?? emptyAudience();
  if (a.kind === "DEPARTMENTS" && !a.departmentIds.length)
    return "Select at least one department for this calendar, or leave it unassigned.";
  if (a.kind === "PEOPLE" && !a.label.trim())
    return "Give this calendar group a name, such as Office or Operations.";
  if (a.kind === "PEOPLE" && !a.employeeIds.length)
    return "Select at least one person for this calendar group, or leave it unassigned.";
  return "";
}
export function audiencePriority(a?: CalendarAudience) {
  return { UNASSIGNED: 0, COMPANY: 1, DEPARTMENTS: 2, PEOPLE: 3 }[
    (a ?? emptyAudience()).kind
  ];
}
