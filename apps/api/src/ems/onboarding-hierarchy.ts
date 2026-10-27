import { importedReportingBody, isReportingBody, reportingBodyLabel } from './reporting-bodies';
import { createPersonSuggester, PersonSuggestion } from './onboarding-person-suggestions';
import { completeNameKey, isNotApplicable, reportingKey } from './onboarding-text';

export interface ReportingRow {
  id: string; batchId?: string; batch?: { status: string }; status: string;
  rowNumber?: number | null; employeeId?: string | null;
  firstName?: string | null; middleName?: string | null; lastName?: string | null;
  employeeCode?: string | null; currentDepartment?: string | null; plantBranchCode?: string | null;
  jobDesignation?: string | null; reportingToName?: string | null; reportingToDesignation?: string | null;
  reportingToRecordId?: string | null; reportingToEmployeeId?: string | null; reportingToBoard?: boolean; reportingToBody?: string | null;
}
export interface ReportingEmployee {
  id: string; firstName: string; middleName?: string | null; lastName: string;
  jobTitle?: string | null; employeeCode?: string | null; plantBranch?: string | null;
  reportingManagerId?: string | null; department?: { name: string } | null;
  reportsToBoard?: boolean; reportingBody?: string | null; pendingReportingRecordId?: string | null;
}
export interface ReportingOption {
  target: string; name: string; designation: string; employeeCode: string; department: string; branch: string;
}
export type ReportingState = 'BOARD' | 'BODY' | 'ASSIGNED' | 'PENDING' | 'UNKNOWN' | 'NEEDS_ATTENTION';
export interface ReportingChainItem {
  target: string; name: string; label: string; designation: string; employeeCode: string;
  recordId?: string; employeeId?: string;
  status: 'PENDING' | 'REGISTERED' | 'NEEDS_ATTENTION' | 'UNKNOWN' | 'BOARD' | 'BODY';
}
export interface ReportingResolution {
  /** Full validation walk, independent of the shortened display chain. No eligibility change. */
  blocker?: { target: string; label: string; reason: string; recordId?: string; batchId?: string; employeeId?: string };
  target: string | null; error: string | null; warning: string | null; depth: number | null;
  state: ReportingState; managerName: string | null;
  errorScope?: 'DIRECT' | 'UPSTREAM';
  chain?: ReportingChainItem[];
  chainEnd?: 'BOARD' | 'BODY' | 'UNRESOLVED' | 'UNKNOWN' | 'CYCLE' | 'LIMIT';
}
const fullName = (p: { firstName?: string | null; middleName?: string | null; lastName?: string | null }) =>
  [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim();
export const isBoardDesignation = (value?: string | null) => ['board', 'board of directors'].includes(reportingKey(value));
const unavailable = (r: ReportingRow) => r.status === 'EXCLUDED' || r.batch?.status === 'CANCELLED';

/** All inputs must be scoped to the same organization. Context rows allow existing employees' pending chains to be checked across imports. */
export function resolveReporting(rows: readonly ReportingRow[], employees: readonly ReportingEmployee[], contextRows: readonly ReportingRow[] = []) {
  const allRows = [...new Map([...contextRows, ...rows].map(r => [r.id, r])).values()];
  const rowMap = new Map(allRows.map(r => [r.id, r]));
  const employeeMap = new Map(employees.map(e => [e.id, e]));
  const employeeOptions: ReportingOption[] = employees.map(e => ({ target: `employee:${e.id}`, name: fullName(e),
    designation: e.jobTitle ?? '', employeeCode: e.employeeCode ?? '', department: e.department?.name ?? '', branch: e.plantBranch ?? '' }));
  const rowOptions = allRows.filter(r => !unavailable(r) && r.status !== 'REGISTERED').map(r => ({
    target: `record:${r.id}`, name: fullName(r), designation: r.jobDesignation ?? '',
    employeeCode: r.employeeCode ?? '', department: r.currentDepartment ?? '', branch: r.plantBranchCode ?? '',
  }));
  // Index names/titles once rather than rescanning every employee for every row.
  type CandidateIndex = { titles: Set<string>; names: Map<string, ReportingOption[]> };
  const index = (): CandidateIndex => ({ titles: new Set(), names: new Map() });
  const existingIndex = index(), batchIndexes = new Map<string | undefined, CandidateIndex>();
  const add = (into: CandidateIndex, option: ReportingOption) => {
    const title = reportingKey(option.designation), key = JSON.stringify([title, completeNameKey(option.name)]);
    into.titles.add(title); into.names.set(key, [...(into.names.get(key) ?? []), option]);
  };
  for (const option of employeeOptions) add(existingIndex, option);
  for (const option of rowOptions) {
    const batchId = rowMap.get(option.target.slice(7))?.batchId;
    if (!batchIndexes.has(batchId)) batchIndexes.set(batchId, index());
    add(batchIndexes.get(batchId)!, option);
  }
  const optionMap = new Map([...employeeOptions, ...rowOptions].map(o => [o.target, o]));
  const currentIds = new Set(rows.map(r => r.id));
  const options = [...employeeOptions, ...rowOptions.filter(o => currentIds.has(o.target.slice(7)))];
  const nameCounts = new Map<string, number>();
  for (const option of optionMap.values()) {
    const key = completeNameKey(option.name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const personLabel = (name: string, designation: string, code: string) =>
    (nameCounts.get(completeNameKey(name)) ?? 0) > 1
      ? `${name} (${[designation, code].filter(Boolean).join(' · ') || 'details unavailable'})` : name;
  const labelFor = (target: string) => {
    const option = optionMap.get(target);
    return option ? personLabel(option.name, option.designation, option.employeeCode) : '';
  };
  type Node = { target: string | null; state: ReportingState; error: string | null; name: string; pendingName?: string };
  const nodes = new Map<string, Node>();
  const rowTarget = (id: string): string => {
    const manager = rowMap.get(id);
    return manager?.status === 'REGISTERED' && manager.employeeId ? `employee:${manager.employeeId}` : `record:${id}`;
  };
  for (const e of employees) {
    let target: string | null = null, state: ReportingState = 'UNKNOWN', error: string | null = null;
    if ([!!e.reportingManagerId, !!e.pendingReportingRecordId, !!e.reportsToBoard, !!e.reportingBody].filter(Boolean).length > 1) error = 'Conflicting reporting assignments. HR must choose one reporting target.';
    else if (e.reportingBody && !isReportingBody(e.reportingBody)) error = 'Unknown reporting body. HR must choose a supported reporting target.';
    else if (e.reportingBody) { target = e.reportingBody; state = target === 'BOARD' ? 'BOARD' : 'BODY'; }
    else if (e.reportsToBoard) { target = 'BOARD'; state = 'BOARD'; }
    else if (e.reportingManagerId) { target = `employee:${e.reportingManagerId}`; state = 'ASSIGNED'; }
    else if (e.pendingReportingRecordId) {
      const r = rowMap.get(e.pendingReportingRecordId);
      target = rowTarget(e.pendingReportingRecordId); state = 'PENDING';
      if (!r || unavailable(r)) error = 'Selected manager was excluded or is unavailable. Choose a replacement on the employee profile.';
    }
    nodes.set(`employee:${e.id}`, { target, state, error, name: labelFor(`employee:${e.id}`),
      pendingName: e.pendingReportingRecordId ? labelFor(rowTarget(e.pendingReportingRecordId)) : undefined });
  }
  for (const r of allRows) {
    const node = `record:${r.id}`;
    if (unavailable(r)) continue;
    if (r.status === 'REGISTERED') {
      nodes.set(node, { target: r.employeeId ? `employee:${r.employeeId}` : null, state: 'ASSIGNED', name: fullName(r),
        error: !r.employeeId || !employeeMap.has(r.employeeId) ? 'Registered employee is unavailable in this organization.' : null });
      continue;
    }
    let target: string | null = null, error: string | null = null;
    const batchIndex = batchIndexes.get(r.batchId);
    if ([!!r.reportingToRecordId, !!r.reportingToEmployeeId, !!r.reportingToBoard, !!r.reportingToBody].filter(Boolean).length > 1) error = 'Choose only one reporting target.';
    else if (r.reportingToBody && !isReportingBody(r.reportingToBody)) error = 'Unknown reporting body. Choose a supported reporting target.';
    else if (r.reportingToBody) target = r.reportingToBody;
    else if (r.reportingToBoard) target = 'BOARD';
    else if (r.reportingToEmployeeId) target = `employee:${r.reportingToEmployeeId}`;
    else if (r.reportingToRecordId) {
      const manager = rowMap.get(r.reportingToRecordId);
      target = rowTarget(r.reportingToRecordId);
      if (!manager || manager.batchId !== r.batchId || unavailable(manager)) error = 'The selected reporting person is unavailable, excluded, or outside this organization/import.';
    } else if (!reportingKey(r.reportingToName) && importedReportingBody(r.reportingToDesignation)) target = importedReportingBody(r.reportingToDesignation);
    else {
      const designation = reportingKey(r.reportingToDesignation), name = reportingKey(r.reportingToName);
      if (!designation || !name) error = 'Choose a reporting person or a top-level reporting body (Board, Committee, Management Committee or Owner).';
      else {
        const titlesExist = existingIndex.titles.has(designation) || batchIndex?.titles.has(designation);
        const matchKey = JSON.stringify([designation, completeNameKey(name)]);
        const matches = [...(existingIndex.names.get(matchKey) ?? []), ...(batchIndex?.names.get(matchKey) ?? [])];
        if (matches.length === 1) target = matches[0].target;
        else error = matches.length > 1 ? 'Multiple people have this name and job title. Choose the correct employee.'
          : titlesExist ? 'The reporting name does not uniquely match that job title. Choose the reporting person; confirm missing middle names or other differences.'
          : 'Reporting job title was not found. Choose the reporting person to use their recorded job title.';
      }
    }
    if (!error && (target === node || (r.employeeId && target === `employee:${r.employeeId}`))) error = 'A person cannot report to themselves.';
    if (!error && !isReportingBody(target)) {
      const selected = target ? optionMap.get(target) : undefined;
      if (!selected) error = 'The selected reporting person is unavailable, excluded, or outside this organization/import.';
      else if (!reportingKey(selected.name) || !reportingKey(selected.designation) || isNotApplicable(selected.designation)) error = 'The selected reporting person needs a name and job title.';
    }
    nodes.set(node, { target, error, name: labelFor(node), state: target === 'BOARD' ? 'BOARD' : isReportingBody(target) ? 'BODY' : target?.startsWith('record:') ? 'PENDING' : 'ASSIGNED',
      pendingName: target?.startsWith('record:') ? labelFor(target) : undefined });
  }

  type Placement = { depth: number | null; relative: number; root: string; warning: string | null; error: string | null; blocker?: string };
  const placed = new Map<string, Placement>();
  // Database IDs identify nodes, but must not decide the visible order. Reimports
  // create new IDs. Source rows and person details survive that change.
  type SourceKey = { row: number; details: string };
  const sourceKeys = new Map<string, SourceKey>();
  const compareSource = (a: SourceKey, b: SourceKey) =>
    (a.row < b.row ? -1 : a.row > b.row ? 1 : 0) || a.details.localeCompare(b.details);
  for (const r of allRows) {
    const key = { row: typeof r.rowNumber === 'number' && Number.isFinite(r.rowNumber) ? r.rowNumber : Infinity,
      details: JSON.stringify([r.employeeCode, fullName(r), r.jobDesignation, r.currentDepartment, r.plantBranchCode].map(v => reportingKey(v))) };
    sourceKeys.set(`record:${r.id}`, key);
    if (r.status === 'REGISTERED' && r.employeeId) {
      const previous = sourceKeys.get(`employee:${r.employeeId}`);
      if (!previous || compareSource(key, previous) < 0) sourceKeys.set(`employee:${r.employeeId}`, key);
    }
  }
  for (const e of employees) if (!sourceKeys.has(`employee:${e.id}`)) sourceKeys.set(`employee:${e.id}`, {
    row: Infinity, details: JSON.stringify([e.employeeCode, fullName(e), e.jobTitle, e.department?.name, e.plantBranch].map(v => reportingKey(v))),
  });
  const compareNodes = (a: string, b: string) => compareSource(sourceKeys.get(a)!, sourceKeys.get(b)!);
  // Iterative walk: no recursion limit, preserve order within unknown-root chains.
  // Stable traversal also fixes the choice of representative inside a cycle.
  for (const start of [...nodes.keys()].sort(compareNodes)) {
    if (placed.has(start)) continue;
    const path: string[] = [], seen = new Map<string, number>(); let cursor = start;
    let base: Placement;
    while (true) {
      const saved = placed.get(cursor);
      if (saved) { base = saved; break; }
      if (seen.has(cursor)) { base = { depth: null, relative: -1, root: cursor, warning: null, error: 'Circular reporting chain. Change a reporting selection to break the loop.' }; break; }
      const n = nodes.get(cursor);
      if (!n) { base = { depth: null, relative: -1, root: cursor, blocker: path[path.length - 1], warning: null, error: 'The reporting chain contains an unresolved or unavailable manager in this organization.' }; break; }
      seen.set(cursor, path.length); path.push(cursor);
      if (n.error) { base = { depth: null, relative: -1, root: cursor, blocker: cursor, warning: null, error: n.error }; break; }
      if (isReportingBody(n.target)) { base = { depth: -1, relative: -1, root: cursor, warning: null, error: null }; break; }
      if (n.target === null) { base = { depth: null, relative: -1, root: cursor, error: null,
        warning: `${n.name || 'This employee'}’s reporting manager has not been recorded. Full hierarchy level is unknown.` }; break; }
      cursor = n.target;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const id = path[i], n = nodes.get(id)!;
      // A registered import row is an alias of its employee, not an extra hierarchy level.
      const alias = id.startsWith('record:') && rowMap.get(id.slice(7))?.status === 'REGISTERED';
      base = { ...base, depth: base.error || base.depth === null ? null : base.depth + (alias ? 0 : 1), relative: base.relative + (alias ? 0 : 1),
        warning: base.error ? null : n.state === 'PENDING' ? `${n.name || 'This employee'} is awaiting ${n.pendingName || 'the selected manager'}’s registration.` : base.warning };
      placed.set(id, base);
    }
  }
  const registeredRows = new Map(rows.filter(r => r.status === 'REGISTERED' && r.employeeId).map(r => [r.employeeId!, r]));
  // Bounded display traversal only; eligibility continues to use the full walk above.
  const chainFor = (start: string): Pick<ReportingResolution, 'chain' | 'chainEnd'> => {
    const chain: ReportingChainItem[] = [], seen = new Set<string>();
    let cursor: string | null = start;
    while (cursor && chain.length < 24) {
      if (isReportingBody(cursor)) {
        const label = reportingBodyLabel(cursor)!;
        const status = cursor === 'BOARD' ? 'BOARD' : 'BODY';
        chain.push({ target: cursor, name: label, label, designation: '', employeeCode: '', status });
        return {chain, chainEnd: status};
      }
      if (seen.has(cursor)) return {chain, chainEnd: 'CYCLE'};
      seen.add(cursor);
      const node = nodes.get(cursor);
      const employeeId = cursor.startsWith('employee:') ? cursor.slice(9) : undefined;
      const importRow = cursor.startsWith('record:') ? rowMap.get(cursor.slice(7))
        : employeeId ? registeredRows.get(employeeId) : undefined;
      // Skip the alias for a registered row; the employee is the same person.
      if (importRow?.status === 'REGISTERED' && cursor.startsWith('record:') && node?.target) { cursor = node.target; continue; }
      const option = optionMap.get(cursor);
      chain.push({target: cursor, name: option?.name || node?.name || 'Unavailable person',
        label: option ? labelFor(cursor) : node?.name || 'Unavailable person',
        designation: option?.designation ?? '', employeeCode: option?.employeeCode ?? '',
        recordId: importRow && currentIds.has(importRow.id) ? importRow.id : undefined, employeeId,
        status: !node || node.error ? 'NEEDS_ATTENTION' : employeeId ? 'REGISTERED' : 'PENDING'});
      if (!node || node.error) return {chain, chainEnd: 'UNRESOLVED'};
      if (!node.target) { chain[chain.length - 1].status = 'UNKNOWN'; return {chain, chainEnd: 'UNKNOWN'}; }
      cursor = node.target;
    }
    return {chain, chainEnd: 'LIMIT'};
  };
  const resolution = (id: string): ReportingResolution => {
    const n = nodes.get(id), p = placed.get(id);
    const managerName = isReportingBody(n?.target) ? reportingBodyLabel(n?.target) : n?.pendingName || (n?.target ? nodes.get(n.target)?.name ?? null : null);
    const direct = n?.state === 'PENDING' ? `Manager assignment pending ${managerName || 'the selected manager'}’s registration. The reporting relationship is valid.` : null;
    const ancestorWarning = n?.target ? placed.get(n.target)?.warning : p?.warning;
    const wider = ancestorWarning ? `Wider reporting chain: ${ancestorWarning}` : null;
    const warning = p?.error ? null : [direct, wider].filter(Boolean).join(' ') || null;
    const upstream = !!p?.error && !!n?.target && nodes.has(n.target) && !n.error && p.root !== id && !p.error.startsWith('Circular reporting chain');
    const error = upstream
      ? `${managerName || 'The selected person'} is selected as manager. Wider reporting chain: ${nodes.get(p!.root)?.name || 'An upstream manager'} — ${p!.error}`
      : p?.error ?? null;
    const problem = upstream && p?.blocker ? p.blocker : undefined;
    const problemRow = problem?.startsWith('record:') ? rowMap.get(problem.slice(7)) : undefined;
    const problemEmployee = problem?.startsWith('employee:') ? employeeMap.get(problem.slice(9)) : undefined;
    const blocker = problem && (problemRow || problemEmployee) ? {
      target: problem, label: labelFor(problem) || nodes.get(problem)?.name || 'Reporting person',
      reason: p!.error!,
      ...(problemEmployee ? {employeeId: problemEmployee.id} : {recordId: problemRow!.id, batchId: problemRow!.batchId}),
    } : undefined;
    return { ...chainFor(id), errorScope: error ? (upstream ? 'UPSTREAM' : 'DIRECT') : undefined, target: n?.target ?? null, state: p?.error ? 'NEEDS_ATTENTION' : n?.state ?? 'UNKNOWN',
      error, warning, depth: p?.depth ?? null,
      managerName, ...(blocker ? {blocker} : {}) };
  };
  const byEmployee: Record<string, ReportingResolution> = {};
  for (const e of employees) byEmployee[e.id] = resolution(`employee:${e.id}`);
  const byRecord: Record<string, ReportingResolution> = {};
  for (const r of allRows) byRecord[r.id] = r.status === 'REGISTERED' && r.employeeId && byEmployee[r.employeeId]
    ? byEmployee[r.employeeId] : unavailable(r) ? { target: null, error: null, warning: null, depth: null, state: 'UNKNOWN', managerName: null } : resolution(`record:${r.id}`);
  const position = (r: ReportingRow) => placed.get(r.status === 'REGISTERED' && r.employeeId ? `employee:${r.employeeId}` : `record:${r.id}`);
  const compareRows = (a: ReportingRow, b: ReportingRow) => compareNodes(`record:${a.id}`, `record:${b.id}`);
  const branchOrder = new Map<string, number>();
  for (const row of [...rows].sort(compareRows)) {
    const root = position(row)?.root;
    if (root !== undefined && !branchOrder.has(root)) branchOrder.set(root, branchOrder.size);
  }
  const ordered = [...rows].sort((a, b) => {
    const group = (r: ReportingRow) => unavailable(r) ? 3 : byRecord[r.id].error ? 2 : byRecord[r.id].depth === null ? 1 : 0;
    const groupDifference = group(a) - group(b); if (groupDifference) return groupDifference;
    if (group(a) === 1 || group(a) === 2) {
      const rootOrder = (branchOrder.get(position(a)?.root ?? '') ?? Infinity)
        - (branchOrder.get(position(b)?.root ?? '') ?? Infinity);
      if (rootOrder) return rootOrder;
      const relative = (position(a)?.relative ?? 0) - (position(b)?.relative ?? 0); if (relative) return relative;
    }
    return (byRecord[a.id].depth ?? Infinity) - (byRecord[b.id].depth ?? Infinity) || compareRows(a, b);
  });
  // Suggestions never create an assignment; exact resolution above stays unchanged.
  const suggest = createPersonSuggester(options);
  const suggestionsByRecord: Record<string, PersonSuggestion<ReportingOption>[]> = {};
  for (const r of rows) {
    suggestionsByRecord[r.id] = [];
    if (unavailable(r) || r.status === 'REGISTERED' || r.reportingToRecordId || r.reportingToEmployeeId || r.reportingToBoard || r.reportingToBody || byRecord[r.id].target) continue;
    suggestionsByRecord[r.id] = suggest(r.reportingToName, r.reportingToDesignation).filter(option =>
      option.target !== `record:${r.id}` && option.target !== `employee:${r.employeeId}`
      && (option.target.startsWith('employee:') || rowMap.get(option.target.slice(7))?.batchId === r.batchId));
  }
  return { options, byRecord, byEmployee, suggestionsByRecord, orderedIds: ordered.map(r => r.id) };
}
