import type { Position, PositionChart, PositionCheck, PositionHolder } from './position-chart.contract';

/** The people records positions are worked out from (the same fields EMS keeps). */
export type PositionEmployee = {
  id: string; firstName: string; middleName?: string | null; lastName: string; jobTitle: string | null;
  departmentId: string | null; plantBranch: string | null; employmentStatus: string; reportingManagerId: string | null;
};
export type PositionInput = {
  company: { id: string; name: string };
  departments: { id: string; name: string }[];
  employees: PositionEmployee[];
  source: PositionChart['source'];
};

// The same rule EMS uses: probation counts as active. People who have left are never on the chart.
const ACTIVE = new Set(['ACTIVE', 'PROBATION']);
const isActive = (e: PositionEmployee) => ACTIVE.has(e.employmentStatus);
const EMPTY_TEXT = /^(n\/?a|none|-+|\.)$/i;
const clean = (value: string | null | undefined) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text && !EMPTY_TEXT.test(text) ? text : null;
};
export const personName = (e: PositionEmployee) => [e.firstName, clean(e.middleName), e.lastName].filter(Boolean).join(' ');
const naturally = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Works out the position chart from people:
 * - everyone who leads a team holds their own position (`pos:<id>`), placed under their manager's position;
 * - people with nobody reporting to them who share a job title under the same manager hold one shared position
 *   (`group:…`, e.g. "Machine Operator · 13 holders"), so the chart shows roles rather than every individual;
 * - people whose reporting is broken (no manager while not at the top, manager missing or left, loops) stay off the
 *   chart and are listed in the checks, to be corrected in EMS.
 */
export function buildPositionChart(input: PositionInput): PositionChart {
  const { company, departments, employees } = input;
  const departmentName = new Map(departments.map(d => [d.id, d.name]));
  const byId = new Map(employees.map(e => [e.id, e]));
  const active = employees.filter(isActive);

  // Branches: shown with the department only when the company has more than one.
  const branches = new Set(active.map(e => clean(e.plantBranch)?.toLowerCase()).filter(Boolean));
  const multiBranch = branches.size > 1;

  // Whose manager is usable (active and in the records), who reports to whom, and reporting loops.
  const managerOf = (e: PositionEmployee) => {
    if (!e.reportingManagerId || e.reportingManagerId === e.id) return null;
    const m = byId.get(e.reportingManagerId);
    return m && isActive(m) ? m : null;
  };
  const inLoop = new Set<string>();
  for (const e of active) {
    const seen = new Set([e.id]); let current: PositionEmployee | null = e;
    while ((current = current && managerOf(current))) { if (seen.has(current.id)) { if (current.id === e.id) inLoop.add(e.id); break; } seen.add(current.id); }
  }
  const team = new Map<string, PositionEmployee[]>();
  for (const e of active) { const m = managerOf(e); if (m && !inLoop.has(e.id)) team.set(m.id, [...(team.get(m.id) ?? []), e]); }
  const leads = (e: PositionEmployee) => (team.get(e.id) ?? []).length > 0;

  // Who is on the chart: the top people (no manager, but leading a team), and everyone connected below them.
  const tops = active.filter(e => !e.reportingManagerId && !inLoop.has(e.id) && leads(e));
  const onChart = new Set<string>();
  const stack = [...tops];
  while (stack.length) { const e = stack.pop()!; if (onChart.has(e.id)) continue; onChart.add(e.id); stack.push(...(team.get(e.id) ?? [])); }

  const unitOf = (people: PositionEmployee[]): Position['unit'] => {
    // The most common department among the holders (one holder: theirs).
    const counts = new Map<string, number>();
    for (const p of people) if (p.departmentId && departmentName.has(p.departmentId)) counts.set(p.departmentId, (counts.get(p.departmentId) ?? 0) + 1);
    const departmentId = [...counts].sort((a, b) => b[1] - a[1] || naturally(departmentName.get(a[0])!, departmentName.get(b[0])!))[0]?.[0];
    if (!departmentId) return null;
    const branch = multiBranch ? clean(people.find(p => p.departmentId === departmentId)?.plantBranch) : null;
    return { departmentId, name: departmentName.get(departmentId)!, branch };
  };
  const holder = (e: PositionEmployee): PositionHolder => ({ employeeId: e.id, name: personName(e), status: e.employmentStatus === 'PROBATION' ? 'PROBATION' : 'ACTIVE' });
  const titleOf = (e: PositionEmployee) => clean(e.jobTitle) ?? 'No job title';

  const positions: Position[] = [];
  const place = (e: PositionEmployee, parentId: string | null) => {
    const id = `pos:${e.id}`;
    positions.push({ id, parentId, title: titleOf(e), unit: unitOf([e]), holders: [holder(e)], vacant: false, basis: 'INFERRED_FROM_PEOPLE' });
    const members = (team.get(e.id) ?? []).filter(m => onChart.has(m.id));
    // Team leaders: a position each. Everyone else: grouped by job title (case and spacing ignored).
    const groups = new Map<string, PositionEmployee[]>();
    for (const m of members) {
      if (leads(m)) continue;
      const key = titleOf(m).toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    for (const [key, people] of groups) {
      if (people.length === 1) { positions.push({ id: `pos:${people[0].id}`, parentId: id, title: titleOf(people[0]), unit: unitOf(people), holders: [holder(people[0])], vacant: false, basis: 'INFERRED_FROM_PEOPLE' }); continue; }
      // The most common spelling of the title is the label.
      const spellings = new Map<string, number>(); for (const p of people) spellings.set(titleOf(p), (spellings.get(titleOf(p)) ?? 0) + 1);
      const title = [...spellings].sort((a, b) => b[1] - a[1] || naturally(a[0], b[0]))[0][0];
      positions.push({ id: `group:${id}:${key}`, parentId: id, title, unit: unitOf(people),
        holders: people.map(holder).sort((a, b) => naturally(a.name, b.name)), vacant: false, basis: 'INFERRED_FROM_PEOPLE' });
    }
    for (const m of members) if (leads(m)) place(m, id);
  };
  for (const top of [...tops].sort((a, b) => naturally(personName(a), personName(b)))) place(top, null);

  // Checks: what kept people off the chart, and gaps on it.
  const checks: PositionCheck[] = [];
  const names = (list: PositionEmployee[]) => list.map(personName).sort(naturally);
  const missing = active.filter(e => e.reportingManagerId && (e.reportingManagerId === e.id || !byId.has(e.reportingManagerId)));
  const left = active.filter(e => { const m = e.reportingManagerId ? byId.get(e.reportingManagerId) : undefined; return m && m.id !== e.id && !isActive(m); });
  const noManager = active.filter(e => !e.reportingManagerId && !leads(e));
  const looped = active.filter(e => inLoop.has(e.id));
  const untitled = active.filter(e => onChart.has(e.id) && !clean(e.jobTitle));
  if (missing.length) checks.push({ kind: 'MANAGER_MISSING', severity: 'ERROR', count: missing.length, people: names(missing),
    message: `${plural(missing.length, 'person reports', 'people report')} to someone who isn't in the records (or to themselves)` });
  if (looped.length) checks.push({ kind: 'REPORTING_LOOP', severity: 'ERROR', count: looped.length, people: names(looped),
    message: `${plural(looped.length, 'person is', 'people are')} in a reporting loop` });
  if (left.length) checks.push({ kind: 'MANAGER_INACTIVE', severity: 'WARNING', count: left.length, people: names(left),
    message: `${plural(left.length, 'person reports', 'people report')} to someone who has left` });
  if (noManager.length) checks.push({ kind: 'NO_MANAGER', severity: 'WARNING', count: noManager.length, people: names(noManager),
    message: `${plural(noManager.length, 'person has', 'people have')} no manager recorded` });
  if (untitled.length) checks.push({ kind: 'NO_JOB_TITLE', severity: 'WARNING', count: untitled.length, people: names(untitled),
    message: `${plural(untitled.length, 'person has', 'people have')} no job title` });

  const connected = active.filter(e => onChart.has(e.id));
  return {
    source: input.source, company, multiBranch, positions, checks,
    people: { onChart: connected.length, probation: connected.filter(e => e.employmentStatus === 'PROBATION').length, notConnected: active.length - connected.length },
  };
}
