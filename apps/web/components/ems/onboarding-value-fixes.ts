/**
 * "Values to sort out" on an import's review page: each odd value in a fixed-list column, once, with how many records
 * have it, and one "Treat as" choice that fixes all of them (the API rewrites them and validates again).
 * VALUE_FIX_CHOICES must match apps/api/src/ems/onboarding-value-fixes.ts (an API test compares them).
 */
export const VALUE_FIX_FIELDS = ['beesAccessLevel', 'employmentStatus', 'employmentType', 'gender'] as const;
export type ValueFixField = typeof VALUE_FIX_FIELDS[number];

/** The text written into the record for each choice. Each is recognised by validation as that choice. */
export const VALUE_FIX_CHOICES: Record<ValueFixField, Record<string, string>> = {
  beesAccessLevel: { EMPLOYEE: 'Employee', MANAGEMENT: 'Executive', HOD: 'HOD', HR: 'HR', ADMIN: 'Admin' },
  employmentStatus: {
    ACTIVE: 'Active', PROBATION: 'Probation', RESIGNED: 'Resigned', TERMINATED: 'Terminated',
    RETIRED: 'Retired', SUSPENDED: 'Suspended', ABSCONDED: 'Absconded', CONTRACT_ENDED: 'Contract ended',
  },
  employmentType: { FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACT: 'Contract', INTERN: 'Intern', CASUAL: 'Casual' },
  gender: { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' },
};

export const VALUE_FIX_FIELD_LABELS: Record<ValueFixField, string> = {
  beesAccessLevel: 'Access level', employmentStatus: 'Employment status', employmentType: 'Employment type', gender: 'Gender',
};


type Finding = { field: string; message: string; code?: string; severity?: 'warning' };
type FixRecord = { id: string; status: string; validationErrors?: Finding[] | null;
  firstName?: string | null; lastName?: string | null; employeeCode?: string | null } & Partial<Record<ValueFixField, string | null>>;

/** Same grouping as the API: case, spaces, punctuation and bracketed notes ignored. */
export const valueKey = (value?: string | null) => String(value ?? '').replace(/[\n\r]+/g, ' ').replace(/\([^)]*\)/g, '')
  .replace(/\s*\/\s*/g, ' ').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

/** Blank, a placeholder like "nil", or N/A: registered as an empty cell. Mirrors the API's isBlankValue / isNotApplicable. */
export function isBlankForFix(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const key = valueKey(value);
  if (key === '' && !/[\p{L}\p{N}]/u.test(value)) return true;
  if (['nil', 'none', 'null', 'noinformationavailable', 'noinfo'].includes(key) && !/[^\x00-\x7F]/.test(value)) return true;
  return ['na', 'notapplicable'].includes(key);
}

const waiting = (record: FixRecord) => record.status !== 'REGISTERED' && record.status !== 'EXCLUDED';
const unrecognised = (finding: Finding) => /^Unrecognised (value|access level) "/.test(finding.message);

export type ValueFixGroup = { field: ValueFixField; key: string; value: string; count: number; recordIds: string[] };

/** Odd values the last validation flagged, one entry per field and spelling-group, most common first. */
export function valueFixGroups(records: FixRecord[]): ValueFixGroup[] {
  const groups = new Map<string, ValueFixGroup>();
  for (const record of records) {
    if (!waiting(record)) continue;
    for (const field of VALUE_FIX_FIELDS) {
      if (!(record.validationErrors ?? []).some(finding => finding.field === field && unrecognised(finding))) continue;
      const value = record[field]?.trim() ?? '';
      const key = valueKey(value);
      if (!key) continue;
      const id = `${field}:${key}`;
      const group = groups.get(id) ?? { field, key, value, count: 0, recordIds: [] };
      group.count++; group.recordIds.push(record.id);
      groups.set(id, group);
    }
  }
  const order = (field: ValueFixField) => VALUE_FIX_FIELDS.indexOf(field);
  return [...groups.values()].sort((a, b) => order(a.field) - order(b.field) || b.count - a.count || a.value.localeCompare(b.value));
}

/** Waiting records whose employment status is blank: required, so HR must choose one. */
export const blankStatusIds = (records: FixRecord[]) => blankStatusRecords(records).map(r => r.id);
export const blankStatusRecords = (records: FixRecord[]) => records.filter(r => waiting(r) && isBlankForFix(r.employmentStatus));

/** HR may only choose Employee for access; anything above needs an Admin. Mirrors the API rule. */
export function valueFixAllowed(field: ValueFixField, to: string, role?: string | null): boolean {
  return field !== 'beesAccessLevel' || to === 'EMPLOYEE' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export type ValueFixRequest = { field: ValueFixField; to: string; remember?: boolean } & ({ from: string; blanks?: undefined } | { blanks: true; from?: undefined });

export type RememberedChoice = { field: string; valueKey: string; value: string; choice: string };

/** The company's remembered choice for this group, if it is still one of the listed choices. */
export function rememberedChoice(group: ValueFixGroup, remembered: RememberedChoice[]): RememberedChoice | undefined {
  const found = remembered.find(choice => choice.field === group.field && choice.valueKey === group.key);
  return found && VALUE_FIX_CHOICES[group.field][found.choice] ? found : undefined;
}
