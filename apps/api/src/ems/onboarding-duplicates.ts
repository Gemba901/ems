import { createHash } from 'node:crypto';
import { normaliseKey } from './onboarding-text';

/** The caller supplies phones normalised by the existing onboarding phone helper. */
export interface DuplicatePerson {
  organizationId: string;
  kind: 'EMPLOYEE' | 'IMPORT';
  id: string;
  /** Keeps the same candidate identity when an import row becomes an employee. */
  originRecordId?: string | null;
  batchId?: string | null;
  batchLabel?: string | null;
  sourceFileName?: string | null;
  rowNumber?: number | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  employeeCode?: string | null;
  canonicalPhone?: string | null;
  department?: string | null;
  designation?: string | null;
  branch?: string | null;
  excluded?: boolean;
  cancelled?: boolean;
}

export type DuplicateReason = 'EMPLOYEE_CODE' | 'PERSONAL_MOBILE' | 'SAME_NAME' | 'NAME_FORMAT' | 'PARTIAL_NAME' | 'SIMILAR_NAME';
export interface DuplicateMatch {
  key: string;
  kind: DuplicatePerson['kind'];
  employeeId: string | null;
  recordId: string | null;
  batchId: string | null;
  batchLabel: string | null;
  sourceFileName: string | null;
  rowNumber: number | null;
  name: string;
  employeeCode: string | null;
  personalMobile: string | null;
  department: string | null;
  designation: string | null;
  branch: string | null;
  reasons: DuplicateReason[];
  supportingDetails: ('DEPARTMENT' | 'DESIGNATION' | 'BRANCH')[];
}
export interface DuplicateReviewReceipt {
  version: 1;
  token: string;
  confirmedByUserId: string;
  confirmedAt: string;
}
export interface DuplicateReview {
  token: string | null;
  hardConflicts: DuplicateMatch[];
  possibleMatches: DuplicateMatch[];
  reviewed: boolean;
  requiresReview: boolean;
  blocked: boolean;
  confirmedAt: string | null;
}

const text = (value?: string | null) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
const keyText = (value?: string | null) => text(value).toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu, '');
const phoneKey = (value?: string | null) => String(value ?? '').replace(/\D/g, '');
const personKey = (person: DuplicatePerson) => person.kind === 'IMPORT'
  ? `record:${person.id}` : person.originRecordId ? `record:${person.originRecordId}` : `employee:${person.id}`;

function nameTokens(person: DuplicatePerson): string[] {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
    .normalize('NFKD').toLocaleLowerCase('en').replace(/\p{M}/gu, '')
    .replace(/['’‘`]/gu, '').split(/[^\p{L}\p{N}]+/gu).filter(Boolean).sort();
}

/** Damerau-Levenshtein with adjacent transpositions, bounded to short name tokens. */
function closeToken(left: string, right: string): boolean {
  if (left === right) return true;
  const a = [...left], b = [...right], longer = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 4 || longer > 24) return false;
  const limit = longer >= 6 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limit) return false;
  let previousPrevious: number[] | undefined;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (previousPrevious && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length] <= limit && previous[b.length] / longer <= 0.3;
}

function nameReason(a: string[], b: string[]): DuplicateReason | null {
  // A shared surname or initials alone are not enough for a possible-person match.
  if (a.filter(token => [...token].length >= 2).length < 2 || b.filter(token => [...token].length >= 2).length < 2) return null;
  if (a.join(' ') === b.join(' ')) return 'SAME_NAME';
  if (a.join('') === b.join('')) return 'NAME_FORMAT';
  const remaining = [...b];
  const missing = a.filter(token => {
    const index = remaining.indexOf(token);
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
  // Compound names may be entered together or separated by a space/hyphen.
  // Consume complete parts in either order; this is still only a review hint.
  const joinedParts = (whole: string[], parts: string[]) => {
    if (!whole.length || parts.length !== whole.length * 2 || whole.length > 2) return false;
    const consume = (index: number, rest: string[]): boolean => {
      if (index === whole.length) return !rest.length;
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
        if (rest[i] + rest[j] !== whole[index] && rest[j] + rest[i] !== whole[index]) continue;
        if (consume(index + 1, rest.filter((_, k) => k !== i && k !== j))) return true;
      }
      return false;
    };
    return consume(0, parts);
  };
  if (joinedParts(missing, remaining) || joinedParts(remaining, missing)) return 'NAME_FORMAT';
  if (!missing.length || !remaining.length) return 'PARTIAL_NAME';
  const small = missing.length <= remaining.length ? missing : remaining;
  const large = small === missing ? remaining : missing;
  // Require the shorter full name to match, permitting omitted middle names.
  // More than two independently changed name tokens is too weak for this matcher.
  if (small.length > 2 || Math.abs(a.length - b.length) > 2) return null;
  const matched = new Map<number, number>();
  const visit = (index: number, seen: Set<number>): boolean => {
    for (let candidate = 0; candidate < large.length; candidate++) {
      if (seen.has(candidate) || !closeToken(small[index], large[candidate])) continue;
      seen.add(candidate);
      const assigned = matched.get(candidate);
      if (assigned === undefined || visit(assigned, seen)) { matched.set(candidate, index); return true; }
    }
    return false;
  };
  return small.every((_, index) => visit(index, new Set())) ? 'SIMILAR_NAME' : null;
}

/** Symmetric-deletion lookup avoids comparing every pair of names in an import. */
function lookupTokens(token: string): string[] {
  const chars = [...token];
  if (chars.length < 4 || chars.length > 24) return [token];
  const keys = new Set([token]);
  for (let i = 0; i < chars.length; i++) {
    keys.add(chars.filter((_, index) => index !== i).join(''));
    if (chars.length >= 6) for (let j = i + 1; j < chars.length; j++)
      keys.add(chars.filter((_, index) => index !== i && index !== j).join(''));
  }
  return [...keys];
}

interface IndexedPerson {
  person: DuplicatePerson;
  key: string;
  names: string[];
  code: string;
  phone: string;
}

function fingerprint(person: IndexedPerson) {
  // Location/label/status are omitted so registering an unchanged candidate does
  // not erase a valid HR decision. Identity and supporting details ARE bound.
  return [person.key, person.names, person.code, person.phone,
    keyText(person.person.department), keyText(person.person.designation), keyText(person.person.branch)];
}

function matchDetails(candidate: IndexedPerson, reasons: DuplicateReason[], subject: DuplicatePerson): DuplicateMatch {
  const person = candidate.person;
  const supportingDetails: DuplicateMatch['supportingDetails'] = [];
  for (const [field, label] of [['department', 'DEPARTMENT'], ['designation', 'DESIGNATION'], ['branch', 'BRANCH']] as const)
    if (keyText(subject[field]) && keyText(subject[field]) === keyText(person[field])) supportingDetails.push(label);
  return {
    key: candidate.key, kind: person.kind,
    employeeId: person.kind === 'EMPLOYEE' ? person.id : null,
    recordId: person.kind === 'IMPORT' ? person.id : person.originRecordId ?? null,
    batchId: person.batchId ?? null, batchLabel: person.batchLabel ?? null,
    sourceFileName: person.sourceFileName ?? null, rowNumber: person.rowNumber ?? null,
    name: [person.firstName, person.middleName, person.lastName].map(value => text(value)).filter(Boolean).join(' ') || 'Unnamed record',
    employeeCode: text(person.employeeCode) || null, personalMobile: person.canonicalPhone || null,
    department: text(person.department) || null, designation: text(person.designation) || null, branch: text(person.branch) || null,
    reasons, supportingDetails,
  };
}

export function createDuplicateIndex(organizationId: string, people: DuplicatePerson[]) {
  const byKey = new Map<string, IndexedPerson>();
  for (const person of people) {
    if (person.organizationId !== organizationId || person.excluded || person.cancelled) continue;
    const key = personKey(person), existing = byKey.get(key);
    // Prefer the employee's current profile over its historical imported text.
    if (existing?.person.kind === 'EMPLOYEE' && person.kind === 'IMPORT') continue;
    byKey.set(key, { person, key, names: nameTokens(person), code: normaliseKey(person.employeeCode ?? null), phone: phoneKey(person.canonicalPhone) });
  }
  const names = new Map<string, Set<string>>(), tokens = new Map<string, Set<string>>();
  const codes = new Map<string, Set<string>>(), phones = new Map<string, Set<string>>();
  const add = (index: Map<string, Set<string>>, value: string, key: string) => {
    if (!value) return;
    const set = index.get(value) ?? new Set<string>(); set.add(key); index.set(value, set);
  };
  for (const person of byKey.values()) {
    add(codes, person.code, person.key); add(phones, person.phone, person.key);
    add(names, person.names.join(''), person.key);
    for (const token of new Set(person.names)) for (const lookup of lookupTokens(token)) add(tokens, lookup, person.key);
  }

  return {
    review(subject: DuplicatePerson, receipt?: unknown): DuplicateReview {
      if (subject.organizationId !== organizationId) throw new Error('Duplicate review organisation mismatch');
      const current: IndexedPerson = {
        person: subject, key: personKey(subject), names: nameTokens(subject),
        code: normaliseKey(subject.employeeCode ?? null), phone: phoneKey(subject.canonicalPhone),
      };
      const candidates = new Set<string>();
      const include = (index: Map<string, Set<string>>, value: string) => { for (const key of index.get(value) ?? []) candidates.add(key); };
      include(codes, current.code); include(phones, current.phone); include(names, current.names.join(''));
      for (const token of new Set(current.names)) for (const lookup of lookupTokens(token)) include(tokens, lookup);
      candidates.delete(current.key);
      const hardConflicts: DuplicateMatch[] = [], possibleMatches: DuplicateMatch[] = [];
      const matchedPeople: IndexedPerson[] = [];
      for (const key of [...candidates].sort()) {
        const candidate = byKey.get(key)!;
        const reasons: DuplicateReason[] = [];
        if (current.code && current.code === candidate.code) reasons.push('EMPLOYEE_CODE');
        if (current.phone && current.phone === candidate.phone) reasons.push('PERSONAL_MOBILE');
        const name = nameReason(current.names, candidate.names);
        if (name) reasons.push(name);
        if (!reasons.length) continue;
        const hard = reasons.includes('EMPLOYEE_CODE') || reasons.includes('PERSONAL_MOBILE');
        (hard ? hardConflicts : possibleMatches).push(matchDetails(candidate, reasons, subject));
        matchedPeople.push(candidate);
      }
      const token = matchedPeople.length ? createHash('sha256')
        .update(JSON.stringify(['ems-duplicate-review-v1', organizationId, fingerprint(current), matchedPeople.map(fingerprint)]))
        .digest('hex') : null;
      const stored = receipt && typeof receipt === 'object' ? receipt as Partial<DuplicateReviewReceipt> : null;
      const reviewed = !!(possibleMatches.length && !hardConflicts.length && token && stored?.version === 1 && stored.token === token &&
        typeof stored.confirmedByUserId === 'string' && stored.confirmedByUserId.trim() &&
        typeof stored.confirmedAt === 'string' && Number.isFinite(Date.parse(stored.confirmedAt)));
      const requiresReview = possibleMatches.length > 0 && !reviewed;
      return { token, hardConflicts, possibleMatches, reviewed, requiresReview,
        blocked: hardConflicts.length > 0 || requiresReview, confirmedAt: reviewed ? stored!.confirmedAt! : null };
    },
  };
}
