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

export interface LeadershipSuggestionOptions {
  headsOfDepartment?: boolean;
  managers?: boolean;
  supervisors?: boolean;
}

const leadershipGroups = [
  { key: "topManagement", label: "Top management" },
  { key: "headsOfDepartment", label: "Heads of department" },
  { key: "managers", label: "Managers" },
  { key: "supervisors", label: "Supervisors" },
] as const;
type LeadershipGroup = (typeof leadershipGroups)[number]["key"];

function leadershipGroup(jobTitle: string | null): LeadershipGroup | null {
  const title = words(jobTitle ?? "");
  // Specific department-head titles stay optional, even if they also contain "manager".
  if (/\bhod\b|\bhead of\b/.test(title)) return "headsOfDepartment";
  if (/\b(ceo|coo|cfo|cto|cio|chro|cmo|chief|director)\b/.test(title))
    return "topManagement";
  if (/\bmanager\b/.test(title)) return "managers";
  if (/\bsupervisor\b/.test(title)) return "supervisors";
  return null;
}

/** Title-based review aids, not confirmed hierarchy or access permissions. */
export function leadershipSuggestionGroups(
  directory: CalendarDirectory,
  options: LeadershipSuggestionOptions = {},
) {
  const seen = new Set<string>();
  const people = directory.people
    .filter((person) => {
      if (!person.active || seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return leadershipGroups
    .filter(({ key }) => key === "topManagement" || options[key])
    .map((group) => ({
      ...group,
      people: people.filter(
        (person) => leadershipGroup(person.jobTitle) === group.key,
      ),
    }));
}

/** Suggestions only. Never turns a job title into an access permission or a maintained group. */
export function suggestedSelection(
  directory: CalendarDirectory,
  kind: SuggestedSelection,
  options: LeadershipSuggestionOptions = {},
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
        : leadershipSuggestionGroups(directory, options).flatMap((group) =>
            group.people.map((person) => person.id),
          ),
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
