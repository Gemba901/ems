import { completeNameKey, isNotApplicable, reportingKey } from './onboarding-text';

export interface SuggestiblePerson {
  target: string; name: string; designation: string; employeeCode: string; unavailable?: boolean;
}
export type PersonSuggestion<T extends SuggestiblePerson = SuggestiblePerson> = T & { suggestionReasons: string[] };
const words = (value?: string | null) => reportingKey(value).split(/[\s,]+/u).filter(Boolean);

// Bounded edit distance: a review hint, never an identity or assignment decision.
function closeSpelling(a: string, b: string): boolean {
  const min = Math.min(a.length, b.length), limit = min >= 7 ? 2 : min >= 4 ? 1 : 0;
  if (!limit || Math.abs(a.length - b.length) > limit || Math.max(a.length, b.length) > 80) return false;
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1] + 1, previous[j] + 1, previous[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    if (Math.min(...next) > limit) return false;
    previous = next;
  }
  return previous[b.length] <= limit;
}
function oneSpellingDifference(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length < 2) return false;
  const remaining = [...b], unmatched: string[] = [];
  for (const word of a) { const i = remaining.indexOf(word); if (i < 0) unmatched.push(word); else remaining.splice(i, 1); }
  return unmatched.length === 1 && remaining.length === 1 && closeSpelling(unmatched[0], remaining[0]);
}

/** Build once per already organization/batch-scoped candidate set. Repeated imported names reuse results. */
export function createPersonSuggester<T extends SuggestiblePerson>(options: readonly T[]) {
  const byWord = new Map<string, Set<T>>();
  const names = new Map<string, string[]>();
  for (const person of options) {
    if (person.unavailable || !reportingKey(person.designation) || isNotApplicable(person.designation)) continue;
    const parts = words(person.name);
    if (parts.length < 2 || parts[0].length < 2 || parts[parts.length - 1].length < 2) continue;
    names.set(person.target, parts);
    for (const part of new Set(parts)) { const group = byWord.get(part) ?? new Set<T>(); group.add(person); byWord.set(part, group); }
  }
  const cache = new Map<string, PersonSuggestion<T>[]>();
  return (name?: string | null, designation?: string | null): PersonSuggestion<T>[] => {
    const parts = words(name), title = isNotApplicable(designation) ? '' : reportingKey(designation);
    if (parts.length < 2 || parts.some(w => w.length < 2) || isNotApplicable(name)) return [];
    const key = JSON.stringify([completeNameKey(name), title]);
    const cached = cache.get(key); if (cached) return cached;
    const pool = new Set<T>();
    for (const part of parts) for (const person of byWord.get(part) ?? []) pool.add(person);
    const result: PersonSuggestion<T>[] = [];
    for (const person of pool) {
      const candidate = names.get(person.target)!;
      const exact = completeNameKey(name) === completeNameKey(person.name);
      const ends = [candidate[0], candidate[candidate.length - 1]];
      const omitted = parts.length === 2 && candidate.length > 2 && completeNameKey(parts.join(' ')) === completeNameKey(ends.join(' '));
      const sameTitle = !!title && title === reportingKey(person.designation);
      // A spelling suggestion requires an unchanged name word AND the recorded title to agree.
      const spelling = sameTitle && (oneSpellingDifference(parts, candidate)
        || (parts.length === 2 && candidate.length > 2 && oneSpellingDifference(parts, ends)));
      if (!exact && !omitted && !spelling) continue;
      const suggestionReasons = [exact ? 'Name matches' : omitted ? 'Imported name omits middle name(s)' : 'Possible spelling match — check spelling and confirm'];
      if (spelling && parts.length === 2 && candidate.length > 2) suggestionReasons.push('Imported name also omits middle name(s)');
      suggestionReasons.push(sameTitle ? 'Job title matches' : title ? 'Job title differs — check the imported and recorded values' : 'Imported job title is missing');
      result.push({...person, suggestionReasons});
    }
    const rank = (p: PersonSuggestion<T>) => p.suggestionReasons[0] === 'Name matches' ? 0 : p.suggestionReasons[0].startsWith('Imported name omits') ? 1 : 2;
    result.sort((a,b) => rank(a)-rank(b) || a.name.localeCompare(b.name) || a.employeeCode.localeCompare(b.employeeCode) || a.target.localeCompare(b.target));
    cache.set(key,result); return result;
  };
}
