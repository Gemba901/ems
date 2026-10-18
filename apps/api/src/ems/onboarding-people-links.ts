import { completeNameKey, isNotApplicable, normaliseKey, reportingKey } from './onboarding-text';

export interface LinkPerson {
  target: string; name: string; designation: string; employeeCode: string; department: string; branch: string;
  employeeId?: string | null; recordId?: string; batchId?: string; unavailable?: boolean;
}
export interface LinkRecord {
  id: string; batchId: string; status: string; employeeId?: string | null;
  firstName?: string | null; middleName?: string | null; lastName?: string | null;
  jobDesignation?: string | null; employeeCode?: string | null; currentDepartment?: string | null; plantBranchCode?: string | null;
  hodName?: string | null; hodDesignation?: string | null; hodReviewKey?: string | null;
  reliever1Name?: string | null; reliever1Designation?: string | null; reliever1RecordId?: string | null; reliever1EmployeeId?: string | null;
  reliever2Name?: string | null; reliever2Designation?: string | null; reliever2RecordId?: string | null; reliever2EmployeeId?: string | null;
  batch?: { status: string };
}
export interface HodAssignment {
  id: string; departmentId: string; branchKey: string; branchLabel: string; revision: number;
  employeeId: string | null; pendingRecordId: string | null; isUnassigned: boolean;
}
export interface LinkResolution {
  target: string | null; state: 'UNASSIGNED' | 'ASSIGNED' | 'PENDING' | 'NEEDS_ATTENTION';
  person: LinkPerson | null; error: string | null; warning: string | null;
}
export interface HodResolution extends LinkResolution {
  departmentId: string | null; departmentName: string; branchKey: string; branchLabel: string;
  version: string; reviewKey: string | null; suggestedTarget: string | null; affectedRecords: number;
}
export interface RecordPeopleLinks { hod: HodResolution; first: LinkResolution; second: LinkResolution; }
export const personName = (p: {firstName?: string | null; middleName?: string | null; lastName?: string | null}) =>
  [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim();
export const branchKey = (value?: string | null) => normaliseKey(value ?? null);
export const scopeKey = (departmentId: string, branch: string) => JSON.stringify([departmentId, branch]);
export const noLink = (): LinkResolution => ({ target: null, state: 'UNASSIGNED', person: null, error: null, warning: null });
export const failedLink = (error: string, target: string | null = null, person: LinkPerson | null = null): LinkResolution =>
  ({ target, state: 'NEEDS_ATTENTION', person, error, warning: null });

/** No reporting-tree traversal: HOD may be the subject, and reciprocal relievers are valid. */
export function peopleIndex(options: readonly LinkPerson[], records: readonly LinkRecord[] = []) {
  const byTarget = new Map(options.map(p => [p.target, p]));
  for (const record of records) {
    if (record.status === 'REGISTERED' && record.employeeId) {
      const employee = byTarget.get(`employee:${record.employeeId}`);
      if (employee) byTarget.set(`record:${record.id}`, employee);
    }
  }
  const canonical = (target: string | null | undefined) => target ? byTarget.get(target)?.target ?? target : null;
  const resolve = (target: string | null, label: string): LinkResolution => {
    if (!target || target === 'NONE') return noLink();
    const person = byTarget.get(target);
    if (!person || person.unavailable) return failedLink(`${label} is unavailable or excluded. Choose another person.`, target, person ?? null);
    if (!person.name || !person.designation || isNotApplicable(person.designation))
      return failedLink(`${label} needs a recorded name and designation.`, person.target, person);
    const pending = person.target.startsWith('record:');
    return { target: person.target, person, state: pending ? 'PENDING' : 'ASSIGNED', error: null,
      warning: pending ? `${label} link will be completed when ${person.name} registers.` : null };
  };
  // Each candidate scope gets one exact name/designation index for this resolution.
  // Store candidates, not mutable LinkResolution objects (second-slot errors are local).
  const matchIndexes = new WeakMap<readonly LinkPerson[], Map<string, LinkPerson[]>>();
  const matchKey = (name: string, title: string) => JSON.stringify([completeNameKey(name), reportingKey(title)]);
  const match = (name: string | null | undefined, title: string | null | undefined, candidates: readonly LinkPerson[], label: string): LinkResolution => {
    const hasName = !!name?.trim() && !isNotApplicable(name), hasTitle = !!title?.trim() && !isNotApplicable(title);
    if (!hasName && !hasTitle) return noLink();
    if (!hasName || !hasTitle) return failedLink(`Choose ${label.toLowerCase()} to confirm both name and designation, or clear both fields.`);
    let matches = matchIndexes.get(candidates);
    if (!matches) {
      const grouped = new Map<string, Map<string | null, LinkPerson>>();
      for (const person of candidates) {
        if (person.unavailable) continue;
        const key = matchKey(person.name, person.designation);
        const group = grouped.get(key) ?? new Map<string | null, LinkPerson>();
        group.set(canonical(person.target), person);
        grouped.set(key, group);
      }
      matches = new Map([...grouped].map(([key, group]) => [key, [...group.values()]]));
      matchIndexes.set(candidates, matches);
    }
    const unique = matches.get(matchKey(name!, title!)) ?? [];
    return unique.length === 1 ? resolve(unique[0].target, label)
      : failedLink(unique.length ? `Several people match ${label.toLowerCase()}. Choose the correct person.`
        : `${label} could not be matched. Choose the person or correct the imported name and designation.`);
  };
  return { byTarget, canonical, resolve, match };
}

interface RelieverContext {
  index: ReturnType<typeof peopleIndex>;
  candidates: readonly LinkPerson[];
  recordsById: ReadonlyMap<string, LinkRecord>;
}

export function resolveRecordRelievers(record: LinkRecord, options: readonly LinkPerson[], allRecords: readonly LinkRecord[] = [], prepared?: RelieverContext) {
  const index = prepared?.index ?? peopleIndex(options, allRecords);
  const candidates = prepared?.candidates ?? options.filter(p => p.target.startsWith('employee:') || p.batchId === record.batchId);
  const resolve = (slot: 1 | 2) => {
    const label = slot === 1 ? 'First reliever' : 'Second reliever';
    const employeeId = record[`reliever${slot}EmployeeId`], recordId = record[`reliever${slot}RecordId`];
    if (employeeId && recordId) return failedLink(`Choose only one ${label.toLowerCase()}.`);
    const target = employeeId ? `employee:${employeeId}` : recordId ? `record:${recordId}` : null;
    let result = target ? index.resolve(target, label) : index.match(record[`reliever${slot}Name`], record[`reliever${slot}Designation`], candidates, label);
    if (recordId) {
      const source = prepared ? prepared.recordsById.get(recordId) : allRecords.find(r => r.id === recordId);
      if (!source || source.batchId !== record.batchId) result = failedLink(`${label} must belong to this import or be an existing employee.`, target);
    }
    if (result.target && (index.canonical(result.target) === index.canonical(`record:${record.id}`)
      || (record.employeeId && result.target === `employee:${record.employeeId}`)))
      return failedLink('A person cannot be their own reliever.', result.target, result.person);
    return result;
  };
  const first = resolve(1), second = resolve(2);
  if (first.target && second.target && index.canonical(first.target) === index.canonical(second.target)) {
    second.error = 'Choose a different person for the second reliever, or leave it unassigned.';
    second.state = 'NEEDS_ATTENTION'; second.warning = null;
  }
  return { first, second };
}

/** Department + branch is the scope; a blank branch is explicitly "branch not specified", never a wildcard. */
export function resolveBatchPeopleLinks(records: readonly LinkRecord[], options: readonly LinkPerson[],
  departments: readonly { id: string; name: string }[], assignments: readonly HodAssignment[], contextRecords: readonly LinkRecord[] = []) {
  const allRecords = [...new Map([...contextRecords, ...records].map(r => [r.id, r])).values()];
  const index = peopleIndex(options, allRecords);
  const currentIds = new Set(records.map(record => record.id));
  const currentOptions = options.filter(p => p.target.startsWith('employee:') || (p.recordId !== undefined && currentIds.has(p.recordId)));
  const recordsById = new Map(allRecords.map(record => [record.id, record]));
  const candidatesByBatch = new Map<string, readonly LinkPerson[]>();
  const departmentsByName = new Map<string, { id: string; name: string }[]>();
  for (const department of departments) {
    const key = normaliseKey(department.name);
    const group = departmentsByName.get(key) ?? [];
    group.push(department); departmentsByName.set(key, group);
  }
  const affectedByScope = new Map<string, number>();
  for (const record of records) {
    if (['REGISTERED', 'EXCLUDED'].includes(record.status)) continue;
    const key = scopeKey(normaliseKey(record.currentDepartment ?? null), branchKey(record.plantBranchCode));
    affectedByScope.set(key, (affectedByScope.get(key) ?? 0) + 1);
  }
  const byScope = new Map(assignments.map(a => [scopeKey(a.departmentId, a.branchKey), a]));
  const byRecord: Record<string, RecordPeopleLinks> = {};
  for (const record of records) {
    const matches = departmentsByName.get(normaliseKey(record.currentDepartment ?? null)) ?? [];
    const department = matches.length === 1 ? matches[0] : null;
    const branch = branchKey(record.plantBranchCode), key = scopeKey(department?.id ?? '', branch);
    const assignment = byScope.get(key);
    const reviewKey = assignment ? `${assignment.id}:${assignment.revision}` : null;
    const imported = index.match(record.hodName, record.hodDesignation, currentOptions, 'HOD');
    const importedFilled = [record.hodName, record.hodDesignation].some(s => !!s?.trim() && !isNotApplicable(s));
    let resolved = assignment ? assignment.isUnassigned ? noLink()
      : index.resolve(assignment.employeeId ? `employee:${assignment.employeeId}` : assignment.pendingRecordId ? `record:${assignment.pendingRecordId}` : '__missing__', 'Department HOD')
      : noLink();
    if (!department && importedFilled) resolved = failedLink('Choose a recognised, unique department before choosing its HOD.');
    else if (!assignment && importedFilled) resolved = failedLink('Review the imported HOD and save the department HOD choice.');
    else if (assignment && !resolved.error && importedFilled && record.hodReviewKey !== reviewKey
      && (imported.error || index.canonical(imported.target) !== index.canonical(resolved.target)))
      resolved = { ...resolved, state: 'NEEDS_ATTENTION', error: 'The imported HOD differs from the department choice. Review and confirm the HOD for this department and branch.', warning: null };
    const hod: HodResolution = { ...resolved, departmentId: department?.id ?? null, departmentName: department?.name ?? record.currentDepartment ?? '',
      branchKey: branch, branchLabel: record.plantBranchCode?.trim() || 'Branch not specified',
      version: JSON.stringify([key, reviewKey]), reviewKey, suggestedTarget: imported.error ? null : imported.target,
      affectedRecords: affectedByScope.get(scopeKey(normaliseKey(record.currentDepartment ?? null), branch)) ?? 0 };
    let candidates = candidatesByBatch.get(record.batchId);
    if (!candidates) {
      candidates = options.filter(p => p.target.startsWith('employee:') || p.batchId === record.batchId);
      candidatesByBatch.set(record.batchId, candidates);
    }
    byRecord[record.id] = { hod, ...resolveRecordRelievers(record, options, allRecords, { index, candidates, recordsById }) };
  }
  return { options: currentOptions.filter(p => !p.unavailable), byRecord };
}

export function peopleLinkFindings(links: RecordPeopleLinks) {
  return ([['hodName', links.hod], ['reliever1Name', links.first], ['reliever2Name', links.second]] as const)
    .filter(([, result]) => result.error).map(([field, result]) => ({ field, message: result.error!, code: 'PEOPLE_LINK' }));
}
