import type {HodDirectoryEntry, PersonSuggestion, ReportingOption} from '@/services/ems.service';

export type PersonChoiceNote = {badge?: string; detail?: string};

/** Combine evidence by exact target ID. Never merge people by name, code or workplace. */
export function hodPickerModel(options: readonly ReportingOption[], directory: readonly HodDirectoryEntry[], suggestions: readonly PersonSuggestion[]) {
  const people = [...new Map(options.map(person => [person.target, person])).values()];
  const eligible = new Set(people.map(person => person.target));
  const appointments = new Map<string, string[]>(), reasons = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, target: string, value: string) => {
    const values = map.get(target) ?? [];
    if (value && !values.includes(value)) values.push(value);
    map.set(target, values);
  };
  for (const entry of directory) {
    if (!entry.target || !eligible.has(entry.target) || !entry.selectable) continue;
    const scope = `${entry.department} · ${entry.branch}`;
    if (entry.source === 'CONFIRMED') add(appointments, entry.target, scope);
    else add(reasons, entry.target, `Named in this import for ${scope}; not a confirmed appointment.`);
  }
  for (const person of suggestions) {
    if (!eligible.has(person.target)) continue;
    for (const reason of person.suggestionReasons?.length ? person.suggestionReasons : ['Possible match — compare the imported and recorded details.'])
      add(reasons, person.target, reason);
  }
  const notes: Record<string, PersonChoiceNote> = {};
  for (const person of people) {
    const scopes = appointments.get(person.target), suggested = reasons.has(person.target);
    if (scopes?.length) notes[person.target] = {badge:'Existing HOD', detail:`HOD for ${scopes[0]}${scopes.length > 1 ? ` (+${scopes.length - 1} more)` : ''}`};
    else if (suggested) notes[person.target] = {badge:'Suggested · unconfirmed'};
  }
  return {people, existing: people.filter(person => appointments.has(person.target)), notes, appointments, reasons,
    unavailable: directory.filter(entry => entry.source === 'CONFIRMED' && entry.target && (!entry.selectable || !eligible.has(entry.target)))};
}

/** Pending records only receive a link when their actual source batch is supplied. */
export function personViewLink(person: ReportingOption): {href: string; label: string} | null {
  if (person.target.startsWith('employee:') && person.target.slice(9))
    return {href:`/ems/employees/${encodeURIComponent(person.target.slice(9))}`, label:'Open employee profile'};
  if (person.target.startsWith('record:') && person.target.slice(7) && person.batchId)
    return {href:`/ems/onboarding/${encodeURIComponent(person.batchId)}?${new URLSearchParams({record:person.target.slice(7)})}`,label:'Open import record'};
  return null;
}
