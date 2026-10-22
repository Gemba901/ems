type Person = { target: string; name: string; department: string };
export const personSearchKey = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
/** Match the API's existing branch-key normalization; this does not change assignment scope. */
export const personBranchKey = (value: string | null | undefined) => (value ?? '')
  .replace(/[\n\r]+/g, ' ').replace(/\([^)]*\)/g, '').replace(/\s*\/\s*/g, ' ')
  .replace(/[^a-zA-Z0-9]+/g, '').trim().toLowerCase();
/** Name-only matching. Exact names, full-name prefixes, word prefixes, then substrings. */
export function searchPeople<T extends Person>(options: readonly T[], search: string): T[] {
  const query = personSearchKey(search);
  const rank = (name: string) => !query || name === query ? 0 : name.startsWith(query) ? 1 : name.split(' ').some(word => word.startsWith(query)) ? 2 : 3;
  return options.filter(p => !query || personSearchKey(p.name).includes(query)).slice().sort((a, b) =>
    rank(personSearchKey(a.name)) - rank(personSearchKey(b.name)) || a.name.localeCompare(b.name) || a.target.localeCompare(b.target));
}

/** Scope groups help browse an empty search; typed names always keep name relevance order. */
export function orderPeopleChoices<T extends Person & {branch?: string | null}>(options: readonly T[], search: string,
  department?: string | null, branch?: string | null): T[] {
  const found = searchPeople(options, search);
  if (personSearchKey(search)) return found;
  const departmentKey = personSearchKey(department), branchKey = personBranchKey(branch);
  const restricted = branch !== undefined && branch !== null;
  const scopeRank = (person: T) => restricted
    ? personBranchKey(person.branch) !== branchKey ? 2 : departmentKey && personSearchKey(person.department) === departmentKey ? 0 : 1
    : departmentKey && personSearchKey(person.department) !== departmentKey ? 1 : 0;
  return found.sort((a, b) => scopeRank(a) - scopeRank(b));
}
