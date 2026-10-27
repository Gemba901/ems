import { createPersonSuggester, PersonSuggestion } from './onboarding-person-suggestions';
import { branchKey, LinkPerson, scopeKey } from './onboarding-people-links';
import { completeNameKey, isNotApplicable, reportingKey } from './onboarding-text';

type ExistingHodRecord = {
  departmentId: string | null; plantBranch: string | null;
  hodName?: string | null; hodDesignation?: string | null;
};

/** Existing profile text is evidence only. Never promote it to a saved assignment. */
export function recordedHodSuggestions(employees: readonly ExistingHodRecord[], options: readonly LinkPerson[]) {
  const groups = new Map<string, Map<string, {name: string; designation: string; count: number}>>();
  for (const employee of employees) {
    const name = employee.hodName?.trim() ?? '';
    if (!employee.departmentId || !name || isNotApplicable(name)) continue;
    const designation = isNotApplicable(employee.hodDesignation) ? '' : employee.hodDesignation?.trim() ?? '';
    const scope = scopeKey(employee.departmentId, branchKey(employee.plantBranch));
    const entries = groups.get(scope) ?? new Map();
    const key = JSON.stringify([completeNameKey(name), reportingKey(designation)]);
    const entry = entries.get(key) ?? {name, designation, count: 0};
    entry.count++; entries.set(key, entry); groups.set(scope, entries);
  }
  const suggest = createPersonSuggester(options.filter(p => p.target.startsWith('employee:') && !p.unavailable));
  const result = new Map<string, PersonSuggestion<LinkPerson>[]>();
  for (const [scope, entries] of groups) {
    const candidates = new Map<string, PersonSuggestion<LinkPerson>>();
    for (const entry of entries.values()) {
      for (const person of suggest(entry.name, entry.designation)) {
        const reasons = [
          `${entry.count} existing employee profile${entry.count === 1 ? '' : 's'} in this department and branch record: ${entry.name}${entry.designation ? ` · ${entry.designation}` : ''}`,
          ...person.suggestionReasons.map(reason => reason.replace(/Imported/g, 'Recorded').replace(/imported/g, 'recorded')),
        ];
        const previous = candidates.get(person.target);
        candidates.set(person.target, {...person, suggestionReasons: [...new Set([...(previous?.suggestionReasons ?? []), ...reasons])]});
      }
    }
    result.set(scope, [...candidates.values()].sort((a,b) => a.name.localeCompare(b.name) || a.target.localeCompare(b.target)));
  }
  return result;
}
