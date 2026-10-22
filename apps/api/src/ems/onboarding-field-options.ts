import { isBlankValue, isNotApplicable, normaliseKey, reportingKey } from './onboarding-text';

type Department = { id: string; name: string };
type Employee = { jobTitle?: string | null; department?: { name: string } | null };
type ImportRow = { jobDesignation?: string | null; currentDepartment?: string | null; status?: string };
const compare = (a: string, b: string) => a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0);

/** Same matching key as registration and HOD resolution. Never pick a duplicate. */
export function departmentIndex(departments: readonly Department[]) {
  const index = new Map<string, Department[]>();
  for (const department of departments) {
    const key = normaliseKey(department.name);
    const group = index.get(key) ?? [];
    if (!group.some(item => item.id === department.id)) group.push(department);
    index.set(key, group);
  }
  return index;
}

export function departmentIssue(value: string | null | undefined, index: ReturnType<typeof departmentIndex>): string | null {
  if (isBlankValue(value)) return 'Required';
  const key = normaliseKey(value ?? null), matches = index.get(key) ?? [];
  if (!key || matches.length > 1) return `Department "${value}" cannot be matched uniquely. Ask an administrator to resolve the department names.`;
  return matches.length ? null : `No department named "${value}" in this organisation`;
}

/** Uses the existing organisation-scoped read snapshot; performs no queries. */
export function onboardingFieldOptions(departments: readonly Department[], employees: readonly Employee[], rows: readonly ImportRow[]) {
  const departmentOptions = [...departmentIndex(departments)].flatMap(([key, group]) => {
    const names = [...new Set(group.map(item => item.name))].sort(compare);
    return names.map(name => ({ name, usable: !!key && group.length === 1 }));
  }).sort((a, b) => compare(a.name, b.name));
  const titles = new Map<string, { value: string; departments: Set<string>; existing: boolean; imported: boolean }>();
  const add = (value: string | null | undefined, department: string | null | undefined, source: 'existing' | 'imported') => {
    if (isBlankValue(value) || isNotApplicable(value)) return;
    const text = value!.trim().replace(/\s+/g, ' '), key = reportingKey(text);
    let title = titles.get(key);
    if (!title) { title = { value: text, departments: new Set(), existing: false, imported: false }; titles.set(key, title); }
    // Prefer a registered spelling; otherwise make display independent of query order.
    if ((source === 'existing' && !title.existing) || (source === 'existing' || !title.existing) && compare(text, title.value) < 0) title.value = text;
    title[source] = true;
    if (!isBlankValue(department)) title.departments.add(department!.trim());
  };
  for (const employee of employees) add(employee.jobTitle, employee.department?.name, 'existing');
  for (const row of rows) if (row.status !== 'EXCLUDED') add(row.jobDesignation, row.currentDepartment, 'imported');
  return { departments: departmentOptions, designations: [...titles.values()].map(title => ({
    ...title, departments: [...title.departments].sort(compare),
  })).sort((a, b) => compare(a.value, b.value)) };
}
