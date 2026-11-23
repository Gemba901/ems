export type DepartmentHod = {
  state: 'NOT_RECORDED' | 'UNASSIGNED' | 'ASSIGNED' | 'PENDING' | 'NEEDS_ATTENTION';
  person: { id: string | null; name: string; employeeCode: string | null; jobTitle: string | null } | null;
};
/** `active` includes probation; `probation` is the part of it still on probation. */
export type DepartmentBranch = { key: string; label: string; total: number; active: number; probation: number; inactive: number; withoutManager: number; hod: DepartmentHod };
export type DepartmentDirectoryRow = { id: string; name: string; total: number; active: number; probation: number; inactive: number; withoutManager: number; branches: DepartmentBranch[] };
/** A branch across the whole company (people with no department included); `active` includes probation. Ranks branch colours. */
export type CompanyBranch = { key: string; label: string; total: number; active: number };
export type DepartmentDirectory = { source: 'EMS'; asOf: string; counts: { total: number; active: number; probation: number; inactive: number; unassigned: number };
  branches?: CompanyBranch[]; departments: DepartmentDirectoryRow[] };
export type DepartmentPeople = {
  department: { id: string; name: string };
  data: { id: string; firstName: string; middleName: string | null; lastName: string; employeeCode: string | null; jobTitle: string | null; plantBranch: string | null; employmentStatus: string }[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export const HOD_STATE_LABEL: Record<DepartmentHod['state'], string> = {
  NOT_RECORDED: 'HOD not recorded', UNASSIGNED: 'Explicitly unassigned', ASSIGNED: 'Confirmed HOD',
  PENDING: 'HOD awaiting registration', NEEDS_ATTENTION: 'HOD needs review',
};
/** Does a HOD (name, employee code or job title) match the search? */
const hodMatches = (hod: DepartmentHod, term: string) => !!hod.person
  && [hod.person.name, hod.person.employeeCode, hod.person.jobTitle].some(value => value?.toLocaleLowerCase().includes(term));

/** Narrow to one branch (when chosen), then keep departments whose name, or one of whose HODs, matches the search. */
export function filterDepartments(rows: DepartmentDirectoryRow[], search: string, selectedBranch: string | null) {
  const term = search.trim().toLocaleLowerCase();
  return rows.flatMap(row => {
    if (selectedBranch === null) return [row];
    const branches = row.branches.filter(branch => branch.key === selectedBranch);
    if (!branches.length) return [];
    const sum = (key: 'total' | 'active' | 'probation' | 'inactive' | 'withoutManager') => branches.reduce((n, b) => n + (b[key] ?? 0), 0);
    return [{ ...row, branches, total: sum('total'), active: sum('active'), probation: sum('probation'), inactive: sum('inactive'), withoutManager: sum('withoutManager') }];
  }).filter(row => !term || row.name.toLocaleLowerCase().includes(term) || row.branches.some(b => hodMatches(b.hod, term)));
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

/** `text` is the full line (exports, tests). When branches are named, `lead` + `branches` let the page show them as links, folding long lists behind "+N". */
export type DepartmentIssue = { kind: 'NO_HOD' | 'HOD_PENDING' | 'HOD_REVIEW' | 'NO_MANAGER' | 'NO_ACTIVE' | 'EMPTY'; text: string; help: string;
  lead?: string; branches?: { key: string; label: string }[] };

export const ISSUE_HELP = {
  NO_HOD: 'Nobody is recorded as head of department here. Use Choose HOD, or choose “No HOD (by choice)” if that is intended.',
  HOD_PENDING: 'The chosen HOD is still waiting to be registered from an import. The link completes once they register.',
  HOD_REVIEW: 'The recorded HOD needs checking, e.g. they belong to another branch or their details changed.',
  NO_MANAGER: 'Active or probation staff with nobody to report to (no manager, and not reporting to the Board or a committee).',
  NO_ACTIVE: 'Everyone recorded here is inactive (resigned, retired, contract ended…). Check whether the department is still in use.',
  EMPTY: 'The department exists but nobody is in it yet.',
} as const;

const list = (labels: string[], max = 3) => labels.slice(0, max).join(', ') + (labels.length > max ? ` +${labels.length - max}` : '');
const people = (n: number) => `${n} ${n === 1 ? 'person has' : 'people have'}`;

/** One clear line per problem. Branch names appear only when the company has several branches.
 * "No HOD (by choice)" is a decision, not a problem. A department with nobody active doesn't also ask for a HOD. */
export function departmentIssues(row: DepartmentDirectoryRow, showBranches: boolean): DepartmentIssue[] {
  if (row.total === 0 && !row.branches.some(b => b.hod.state !== 'NOT_RECORDED')) return [{ kind: 'EMPTY', text: 'No people yet', help: ISSUE_HELP.EMPTY }];
  const where = (state: DepartmentHod['state']) => row.branches.filter(b => b.hod.state === state).map(b => ({ key: b.key, label: b.label }));
  const labels = (branches: { label: string }[]) => list(branches.map(b => b.label));
  const named = showBranches && row.branches.length > 1;
  const issues: DepartmentIssue[] = [];
  const missing = where('NOT_RECORDED'), pending = where('PENDING'), review = where('NEEDS_ATTENTION');
  const noActive = row.total > 0 && row.active === 0;
  if (noActive) issues.push({ kind: 'NO_ACTIVE', help: ISSUE_HELP.NO_ACTIVE, text: `No active people (${row.total} inactive)` });
  if (missing.length && !noActive) {
    const lead = missing.length === row.branches.length ? `No HOD at any of its ${missing.length} branches` : `${missing.length} of ${row.branches.length} branches have no HOD`;
    issues.push(named ? { kind: 'NO_HOD', help: ISSUE_HELP.NO_HOD, text: `${lead}: ${labels(missing)}`, lead, branches: missing }
      : { kind: 'NO_HOD', help: ISSUE_HELP.NO_HOD, text: 'No HOD' });
  }
  if (pending.length) issues.push(named ? { kind: 'HOD_PENDING', help: ISSUE_HELP.HOD_PENDING, text: `HOD not registered yet at ${labels(pending)}`, lead: 'HOD not registered yet at', branches: pending }
    : { kind: 'HOD_PENDING', help: ISSUE_HELP.HOD_PENDING, text: 'HOD not registered yet' });
  if (review.length) issues.push(named ? { kind: 'HOD_REVIEW', help: ISSUE_HELP.HOD_REVIEW, text: `HOD needs review at ${labels(review)}`, lead: 'HOD needs review at', branches: review }
    : { kind: 'HOD_REVIEW', help: ISSUE_HELP.HOD_REVIEW, text: 'HOD needs review' });
  if (row.withoutManager > 0) issues.push({ kind: 'NO_MANAGER', help: ISSUE_HELP.NO_MANAGER, text: `${people(row.withoutManager)} no manager` });
  return issues;
}

/** For the HOD column: branches with a HOD (or deliberately none) are listed. Missing ones are named in Status, not repeated here. */
export function hodColumn(row: DepartmentDirectoryRow) {
  return { shown: row.branches.filter(b => b.hod.state !== 'NOT_RECORDED'), missing: row.branches.filter(b => b.hod.state === 'NOT_RECORDED') };
}

/** HODs view filter by the HOD's state. (`true` / `false` are the old "Missing only" switch.) */
export type HodStateFilter = 'ALL' | 'HAS' | 'MISSING' | 'BY_CHOICE' | 'PENDING' | 'REVIEW';
const HOD_STATE_OF: Record<Exclude<HodStateFilter, 'ALL'>, DepartmentHod['state']> = {
  HAS: 'ASSIGNED', MISSING: 'NOT_RECORDED', BY_CHOICE: 'UNASSIGNED', PENDING: 'PENDING', REVIEW: 'NEEDS_ATTENTION',
};
export type HodFilters = { state?: HodStateFilter | boolean; person?: string | null; search?: string };
const stateOf = (state: HodFilters['state']): HodStateFilter => state === true ? 'MISSING' : state === false || state === undefined ? 'ALL' : state;

/** HODs view: one row per department and branch. Filters: HOD state, one person's HOD roles, and a search across
 * department, branch and the HOD's name, code and job title. (A boolean second argument still means "Missing only".) */
export function hodRows(rows: DepartmentDirectoryRow[], filters: HodFilters | boolean = {}) {
  const { state, person, search } = typeof filters === 'boolean' ? { state: filters } : filters;
  const want = stateOf(state), term = (search ?? '').trim().toLocaleLowerCase();
  return rows.flatMap(department => department.branches.map(branch => ({ department, branch })))
    .filter(({ branch }) => want === 'ALL' || branch.hod.state === HOD_STATE_OF[want])
    .filter(({ branch }) => !person || branch.hod.person?.id === person)
    .filter(({ department, branch }) => !term || department.name.toLocaleLowerCase().includes(term)
      || branch.label.toLocaleLowerCase().includes(term) || hodMatches(branch.hod, term))
    .sort((a, b) => a.department.name.localeCompare(b.department.name) || a.branch.label.localeCompare(b.branch.label));
}
/** How many department-branch entries are in each HOD state (for the filter's labels). */
export function hodStateCounts(rows: DepartmentDirectoryRow[], filters: Omit<HodFilters, 'state'> = {}): Record<HodStateFilter, number> {
  const entries = hodRows(rows, filters);
  const counts = { ALL: entries.length, HAS: 0, MISSING: 0, BY_CHOICE: 0, PENDING: 0, REVIEW: 0 };
  for (const { branch } of entries) for (const [key, value] of Object.entries(HOD_STATE_OF)) if (branch.hod.state === value) counts[key as keyof typeof counts]++;
  return counts;
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

export type DepartmentSort = 'NAME' | 'PEOPLE' | 'FEWEST' | 'ISSUES';
export function sortDepartments(rows: DepartmentDirectoryRow[], sort: DepartmentSort, showBranches: boolean): DepartmentDirectoryRow[] {
  const byName = (a: DepartmentDirectoryRow, b: DepartmentDirectoryRow) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (sort === 'FEWEST') return [...rows].sort((a, b) => a.total - b.total || byName(a, b));
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

export type HodGrouping = 'DEPARTMENT' | 'BRANCH';
export type HodGroup = { key: string; label: string; entries: { department: DepartmentDirectoryRow; branch: DepartmentBranch }[] };
/** "HODs" view groups: by department (default), or by branch ("Branch not recorded" last). */
export function hodGroups(rows: DepartmentDirectoryRow[], filters: HodFilters | boolean, by: HodGrouping): HodGroup[] {
  const groups = new Map<string, HodGroup>();
  for (const entry of hodRows(rows, filters)) {
    const key = by === 'BRANCH' ? entry.branch.key : entry.department.id;
    if (!groups.has(key)) groups.set(key, { key, label: by === 'BRANCH' ? entry.branch.label : entry.department.name, entries: [] });
    groups.get(key)!.entries.push(entry);
  }
  const last = (g: HodGroup) => Number(by === 'BRANCH' && g.label === 'Branch not recorded');
  return [...groups.values()].sort((a, b) => last(a) - last(b) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

// ---------- The page's place in the address, so Back (and reload) return to the same view ----------

export type DepartmentsView = 'DEPARTMENTS' | 'BRANCHES' | 'HODS';
export type DepartmentsPageState = { view: DepartmentsView; filter: DepartmentFilter; sort: DepartmentSort; branch: string | null; search: string;
  group: HodGrouping; layout: 'CARDS' | 'TABLE'; hodState: HodStateFilter; hod: string | null };
export const DEFAULT_PAGE_STATE: DepartmentsPageState = { view: 'DEPARTMENTS', filter: 'ALL', sort: 'NAME', branch: null, search: '', group: 'DEPARTMENT', layout: 'CARDS', hodState: 'ALL', hod: null };
const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;

/** Unknown or tampered values fall back to the defaults. */
export function readPageState(params: URLSearchParams): DepartmentsPageState {
  return {
    view: pick(params.get('view'), ['DEPARTMENTS', 'BRANCHES', 'HODS'], 'DEPARTMENTS'),
    filter: pick(params.get('filter'), ['ALL', 'NO_HOD', 'ATTENTION', 'EMPTY'], 'ALL'),
    sort: pick(params.get('sort'), ['NAME', 'PEOPLE', 'FEWEST', 'ISSUES'], 'NAME'),
    branch: params.has('branch') ? (params.get('branch') ?? '').slice(0, 200) : null,
    search: (params.get('q') ?? '').slice(0, 120),
    group: pick(params.get('group'), ['DEPARTMENT', 'BRANCH'], 'DEPARTMENT'),
    layout: pick(params.get('layout'), ['CARDS', 'TABLE'], 'CARDS'),
    // "missing=1" is the older address for "No HOD".
    hodState: params.get('missing') === '1' ? 'MISSING' : pick(params.get('hods'), ['ALL', 'HAS', 'MISSING', 'BY_CHOICE', 'PENDING', 'REVIEW'], 'ALL'),
    hod: /^[A-Za-z0-9_-]{1,64}$/.test(params.get('hod') ?? '') ? params.get('hod') : null,
  };
}
/** Only what differs from the defaults goes into the address. */
export function writePageState(state: DepartmentsPageState): string {
  const p = new URLSearchParams(), d = DEFAULT_PAGE_STATE;
  if (state.view !== d.view) p.set('view', state.view);
  if (state.filter !== d.filter) p.set('filter', state.filter);
  if (state.sort !== d.sort) p.set('sort', state.sort);
  if (state.branch !== null) p.set('branch', state.branch);
  if (state.search.trim()) p.set('q', state.search);
  if (state.group !== d.group) p.set('group', state.group);
  if (state.layout !== d.layout) p.set('layout', state.layout);
  if (state.hodState !== d.hodState) p.set('hods', state.hodState);
  if (state.hod) p.set('hod', state.hod);
  return p.toString();
}
/** Back from a department: the list exactly as it was, but only an explicitly allowed Organisation address on this site. */
export function departmentsBackHref(from: string | null | undefined): string {
  return from && /^\/ems\/organisation(?:\/chart(?:-v[23])?)?(?:\?[^#]*)?$/.test(from) ? from : '/ems/organisation';
}

// ---------- Export ----------

/** Spreadsheet-safe CSV: quotes every cell and stops formulas (=, +, -, @) from running when opened. */
const csvCell = (value: string | number) => {
  const text = String(value), safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
/** One line per department and branch, as filtered on screen. */
export function departmentsCsv(rows: DepartmentDirectoryRow[], showBranches: boolean): string {
  const header = ['Department', ...(showBranches ? ['Branch'] : []), 'HOD', 'HOD status', 'People', 'Active', 'Probation', 'Inactive', 'Needs attention'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const issues = departmentIssues(row, showBranches).map(i => i.text).join('; ');
    const branches: (DepartmentBranch | null)[] = row.branches.length ? row.branches : [null];
    for (const b of branches) {
      const counts = b ?? row, hod = b?.hod;
      lines.push([row.name, ...(showBranches ? [b?.label ?? ''] : []), hod?.person?.name ?? '', hod ? (hod.state === 'NOT_RECORDED' ? 'No HOD' : hod.state === 'UNASSIGNED' ? 'No HOD (by choice)' : HOD_STATE_LABEL[hod.state]) : '',
        counts.total, activeOnly(counts), counts.probation, counts.inactive, issues].map(csvCell).join(','));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/** Two letters for a person's avatar circle. */
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
};
