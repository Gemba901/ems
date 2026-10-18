export type ExistingDepartment = { id: string; name: string };
export type DepartmentReview = {
  key: string; name: string; occurrences: number;
  status: 'new' | 'existing' | 'invalid' | 'ambiguous'; detail: string;
};
export const MAX_SETUP_NAMES = 100;
export const cleanName = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
export const nameKey = (value: string) => cleanName(value).toLowerCase();
const importKey = (value: string) => value.replace(/[\n\r]+/g, ' ').replace(/\([^)]*\)/g, '')
  .replace(/\s*\/\s*/g, ' ').replace(/[^a-zA-Z0-9]+/g, '').trim().toLowerCase();

export function reviewDepartments(text: string, existing: ExistingDepartment[]): DepartmentReview[] {
  const groups = new Map<string, { name: string; occurrences: number }>();
  for (const line of text.split(/\r?\n/)) {
    const name = cleanName(line);
    if (!name) continue;
    const key = nameKey(name), old = groups.get(key);
    groups.set(key, { name: old?.name ?? name, occurrences: (old?.occurrences ?? 0) + 1 });
  }
  return [...groups].map(([key, value]) => {
    const marker = key.replace(/[^a-z0-9]/g, '');
    const problem = value.name.length > 160 ? 'Use at most 160 characters.'
      : /[\u0000-\u001f\u007f]/.test(value.name) ? 'Remove control characters.'
      : !/[\p{L}\p{N}]/u.test(value.name) || /^(na|nil|none|null|notapplicable|noinfo|noinformationavailable)$/.test(marker)
        ? 'Placeholder: replace with a real department in the employee sheet.' : '';
    if (problem) return { key, ...value, status: 'invalid', detail: problem };
    if (!importKey(value.name)) return { key, ...value, status: 'invalid', detail: 'The current employee importer needs department names containing A–Z letters or numbers.' };
    const collision = [...existing.map(row => row.name), ...[...groups.values()].map(row => row.name)]
      .find(other => importKey(other) === importKey(value.name) && nameKey(other) !== key);
    if (collision) return { key, ...value, status: 'ambiguous', detail: `Employee imports cannot distinguish this from "${collision}". Use the same department name in the workbook and department list.` };
    const matches = existing.filter(row => nameKey(row.name) === key);
    if (matches.length > 1) return { key, ...value, status: 'ambiguous', detail: 'Multiple existing departments share this name. Ask an admin to resolve them before importing into this department.' };
    if (matches.length === 1) return { key, ...value, status: 'existing', detail: `Already exists: ${matches[0].name}` };
    return { key, ...value, status: 'new', detail: 'Will be created when selected.' };
  });
}

export function suggestColumn(rows: unknown[][]): { header: number; column: number } | null {
  for (let header = 0; header < Math.min(rows.length, 20); header++) {
    const column = rows[header].findIndex(value => /^(department|departmentname|dept|deptname)$/.test(String(value ?? '').toLowerCase().replace(/[^a-z]/g, '')));
    if (column >= 0) return { header, column };
  }
  return null;
}

export function namesFromColumn(rows: unknown[][], header: number, column: number): string[] {
  return rows.slice(header + 1).map(row => cleanName(String(row[column] ?? ''))).filter(Boolean);
}
