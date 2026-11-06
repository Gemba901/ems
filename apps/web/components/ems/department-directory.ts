export type DepartmentHod = {
  state: 'NOT_RECORDED' | 'UNASSIGNED' | 'ASSIGNED' | 'PENDING' | 'NEEDS_ATTENTION';
  person: { id: string | null; name: string; employeeCode: string | null; jobTitle: string | null } | null;
};
/** `active` includes probation; `probation` is the part of it still on probation. */
export type DepartmentBranch = { key: string; label: string; total: number; active: number; probation: number; inactive: number; withoutManager: number; hod: DepartmentHod };
export type DepartmentDirectoryRow = { id: string; name: string; total: number; active: number; probation: number; inactive: number; withoutManager: number; branches: DepartmentBranch[] };
export type DepartmentDirectory = { source: 'EMS'; asOf: string; counts: { total: number; active: number; probation: number; inactive: number; unassigned: number }; departments: DepartmentDirectoryRow[] };
export type DepartmentPeople = {
  department: { id: string; name: string };
  data: { id: string; firstName: string; middleName: string | null; lastName: string; employeeCode: string | null; jobTitle: string | null; plantBranch: string | null; employmentStatus: string }[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export const HOD_STATE_LABEL: Record<DepartmentHod['state'], string> = {
  NOT_RECORDED: 'HOD not recorded', UNASSIGNED: 'Explicitly unassigned', ASSIGNED: 'Confirmed HOD',
  PENDING: 'HOD awaiting registration', NEEDS_ATTENTION: 'HOD needs review',
};
export function filterDepartments(rows: DepartmentDirectoryRow[], search: string, selectedBranch: string | null) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(row => !term || row.name.toLocaleLowerCase().includes(term)).flatMap(row => {
    if (selectedBranch === null) return [row];
    const branches = row.branches.filter(branch => branch.key === selectedBranch);
    if (!branches.length) return [];
    const sum = (key: 'total' | 'active' | 'probation' | 'inactive' | 'withoutManager') => branches.reduce((n, b) => n + (b[key] ?? 0), 0);
    return [{ ...row, branches, total: sum('total'), active: sum('active'), probation: sum('probation'), inactive: sum('inactive'), withoutManager: sum('withoutManager') }];
  });
}

// ---------- Organisation → Departments: what the page shows and how it groups, filters and sorts ----------

/** People who are working: active, not counting those still on probation. */
export const activeOnly = (counts: { active: number; probation?: number }) => counts.active - (counts.probation ?? 0);

/** More than one real branch recorded in the company: only then do branches appear on the page. */
export function hasSeveralBranches(rows: DepartmentDirectoryRow[]): boolean {
  const keys = new Set<string>();
  for (const row of rows) for (const b of row.branches) if (b.label !== 'Branch not recorded') keys.add(b.key);
  return keys.size > 1;
}

export type DepartmentIssue = { kind: 'NO_HOD' | 'HOD_PENDING' | 'HOD_REVIEW' | 'NO_MANAGER' | 'EMPTY'; text: string; help: string };

export const ISSUE_HELP = {
  NO_HOD: 'Nobody is recorded as head of department here. Set one in Set up departments, or on an import record.',
  HOD_PENDING: 'The chosen HOD is still waiting to be registered from an import. The link completes once they register.',
  HOD_REVIEW: 'The recorded HOD needs checking, e.g. they belong to another branch or their details changed.',
  NO_MANAGER: 'Active or probation staff with nobody to report to (no manager, and not reporting to the Board or a committee).',
  EMPTY: 'The department exists but nobody is in it yet.',
} as const;

const list = (labels: string[], max = 3) => labels.slice(0, max).join(', ') + (labels.length > max ? ` +${labels.length - max}` : '');
const people = (n: number) => `${n} ${n === 1 ? 'person has' : 'people have'}`;

/** One clear line per problem. Branch names appear only when the company has several branches. */
export function departmentIssues(row: DepartmentDirectoryRow, showBranches: boolean): DepartmentIssue[] {
  if (row.total === 0 && !row.branches.some(b => b.hod.state !== 'NOT_RECORDED')) return [{ kind: 'EMPTY', text: 'No people yet', help: ISSUE_HELP.EMPTY }];
  const where = (state: DepartmentHod['state']) => row.branches.filter(b => b.hod.state === state).map(b => b.label);
  const issues: DepartmentIssue[] = [];
  const missing = where('NOT_RECORDED'), pending = where('PENDING'), review = where('NEEDS_ATTENTION');
  if (missing.length) issues.push({ kind: 'NO_HOD', help: ISSUE_HELP.NO_HOD,
    text: !showBranches || row.branches.length === 1 ? 'No HOD' : missing.length === row.branches.length ? `No HOD at any of its ${missing.length} branches` : `${missing.length} of ${row.branches.length} branches have no HOD` });
  if (pending.length) issues.push({ kind: 'HOD_PENDING', help: ISSUE_HELP.HOD_PENDING, text: showBranches && row.branches.length > 1 ? `HOD not registered yet at ${list(pending)}` : 'HOD not registered yet' });
  if (review.length) issues.push({ kind: 'HOD_REVIEW', help: ISSUE_HELP.HOD_REVIEW, text: showBranches && row.branches.length > 1 ? `HOD needs review at ${list(review)}` : 'HOD needs review' });
  if (row.withoutManager > 0) issues.push({ kind: 'NO_MANAGER', help: ISSUE_HELP.NO_MANAGER, text: `${people(row.withoutManager)} no manager` });
  return issues;
}

/** For the HOD column: branches with a HOD (or deliberately none) are listed; branches with no HOD are summarised in one line. */
export function hodColumn(row: DepartmentDirectoryRow) {
  const shown = row.branches.filter(b => b.hod.state !== 'NOT_RECORDED');
  const missing = row.branches.filter(b => b.hod.state === 'NOT_RECORDED').map(b => b.label);
  return { shown, missing, missingText: !missing.length ? null
    : row.branches.length === 1 ? 'No HOD'
    : missing.length === row.branches.length ? `No HOD at any of its ${missing.length} branches: ${list(missing)}`
    : `No HOD at ${missing.length} ${missing.length === 1 ? 'branch' : 'branches'}: ${list(missing)}`, missingAll: missing.join(', ') };
}

/** "HODs" view: one row per department and branch, missing HODs first when asked. */
export function hodRows(rows: DepartmentDirectoryRow[], missingOnly: boolean) {
  return rows.flatMap(department => department.branches.map(branch => ({ department, branch })))
    .filter(entry => !missingOnly || entry.branch.hod.state === 'NOT_RECORDED')
    .sort((a, b) => a.department.name.localeCompare(b.department.name) || a.branch.label.localeCompare(b.branch.label));
}

export type DepartmentFilter = 'ALL' | 'NO_HOD' | 'ATTENTION' | 'EMPTY';
export const departmentMatches = (row: DepartmentDirectoryRow, filter: DepartmentFilter, showBranches: boolean) => {
  if (filter === 'ALL') return true;
  const issues = departmentIssues(row, showBranches);
  if (filter === 'NO_HOD') return issues.some(i => i.kind === 'NO_HOD');
  if (filter === 'EMPTY') return issues.some(i => i.kind === 'EMPTY');
  return issues.length > 0;
};

/** Counts for the summary chips (each chip filters the list). */
export function departmentSummary(rows: DepartmentDirectoryRow[], showBranches: boolean) {
  return {
    all: rows.length,
    noHod: rows.filter(r => departmentMatches(r, 'NO_HOD', showBranches)).length,
    attention: rows.filter(r => departmentMatches(r, 'ATTENTION', showBranches)).length,
    empty: rows.filter(r => departmentMatches(r, 'EMPTY', showBranches)).length,
  };
}

export type DepartmentSort = 'NAME' | 'PEOPLE' | 'ISSUES';
export function sortDepartments(rows: DepartmentDirectoryRow[], sort: DepartmentSort, showBranches: boolean): DepartmentDirectoryRow[] {
  const byName = (a: DepartmentDirectoryRow, b: DepartmentDirectoryRow) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const key = (row: DepartmentDirectoryRow) => sort === 'PEOPLE' ? row.total : sort === 'ISSUES' ? departmentIssues(row, showBranches).filter(i => i.kind !== 'EMPTY').length : 0;
  return [...rows].sort((a, b) => sort === 'NAME' ? byName(a, b) : key(b) - key(a) || byName(a, b));
}

/** The same departments, grouped under each branch (for "Group by: Branch"). Departments without a branch go under "Branch not recorded". */
export function groupByBranch(rows: DepartmentDirectoryRow[]) {
  const groups = new Map<string, { key: string; label: string; total: number; entries: { department: DepartmentDirectoryRow; branch: DepartmentBranch }[] }>();
  for (const department of rows) for (const branch of department.branches) {
    let group = groups.get(branch.key);
    if (!group) { group = { key: branch.key, label: branch.label, total: 0, entries: [] }; groups.set(branch.key, group); }
    group.total += branch.total; group.entries.push({ department, branch });
  }
  return [...groups.values()].sort((a, b) => Number(a.label === 'Branch not recorded') - Number(b.label === 'Branch not recorded') || a.label.localeCompare(b.label));
}

/** Two letters for a person's avatar circle. */
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
};
