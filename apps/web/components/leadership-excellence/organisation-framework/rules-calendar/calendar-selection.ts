import type { CalendarDirectory } from "./calendar-audience.types";

export type SuggestedSelection = "OFFICE" | "PRODUCTION" | "LEADERSHIP";
export const SUGGESTED_SELECTION_LABELS = {
  OFFICE: "Office teams",
  PRODUCTION: "Production / site teams",
  LEADERSHIP: "Leadership",
} as const;
const words = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Suggestions only. Never turns a job title into an access permission or a maintained group. */
export function suggestedSelection(
  directory: CalendarDirectory,
  kind: SuggestedSelection,
  managers = false,
  supervisors = false,
) {
  const departmentPattern =
    kind === "OFFICE"
      ? /\b(hr|human resources|admin|administration|administrative|finance|financial|accounts|accounting)\b/
      : /\b(production|manufacturing|maintenance|warehouse|warehousing|stores|quality)\b/;
  return {
    departmentIds:
      kind === "LEADERSHIP"
        ? []
        : directory.departments
            .filter((d) => departmentPattern.test(words(d.name)))
            .map((d) => d.id),
    employeeIds:
      kind !== "LEADERSHIP"
        ? []
        : directory.people
            .filter((p) => {
              if (!p.active || !p.jobTitle) return false;
              const title = words(p.jobTitle);
              return (
                /\b(ceo|coo|cfo|cto|cio|chro|cmo|hod|chief|director)\b|\bhead of\b/.test(
                  title,
                ) ||
                (managers && /\bmanager\b/.test(title)) ||
                (supervisors && /\bsupervisor\b/.test(title))
              );
            })
            .map((p) => p.id),
  };
}

/** Exact country codes and names starting with the query appear before substring matches. */
export function countryOptions(
  countries: Record<string, string>,
  search: string,
) {
  const q = search.trim().toLocaleLowerCase();
  const rank = ([code, name]: [string, string]) =>
    !q
      ? 0
      : code.toLowerCase() === q
        ? 0
        : name.toLocaleLowerCase().startsWith(q)
          ? 1
          : code.toLowerCase().startsWith(q)
            ? 2
            : `${name} ${code}`.toLocaleLowerCase().includes(q)
              ? 3
              : 4;
  return Object.entries(countries)
    .filter((entry) => rank(entry) < 4)
    .sort((a, b) => rank(a) - rank(b) || a[1].localeCompare(b[1]));
}
