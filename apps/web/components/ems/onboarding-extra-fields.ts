// Same contract in the API and web; keep both copies in sync.
// Only these existing profile fields can be populated from additional columns.
export const EXTRA_PROFILE_FIELDS = [
  { key: 'dateOfBirth', label: 'Date of birth', kind: 'date' },
  { key: 'nationalId', label: 'National ID', kind: 'text' },
  { key: 'dateJoined', label: 'Date joined', kind: 'date' },
  { key: 'section', label: 'Section', kind: 'text' },
  { key: 'jobDescription', label: 'Job description', kind: 'text' },
  { key: 'level', label: 'Level', kind: 'text' },
  { key: 'grade', label: 'Grade', kind: 'text' },
  { key: 'jobCategory', label: 'Job category', kind: 'text' },
  { key: 'primaryWorkRole', label: 'Primary work role', kind: 'text' },
  { key: 'machineProcess', label: 'Machine / process', kind: 'text' },
  { key: 'homeAddress', label: 'Home address', kind: 'text' },
  { key: 'emergencyContactName', label: 'Emergency contact name', kind: 'text' },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', kind: 'phone' },
  { key: 'emergencyContactRelationship', label: 'Emergency contact relationship', kind: 'text' },
  { key: 'skillLevel', label: 'Skill level', kind: 'skill' },
  { key: 'trainingNeeded', label: 'Training needed', kind: 'boolean' },
] as const;
export type ExtraProfileField = typeof EXTRA_PROFILE_FIELDS[number]['key'];
export type ImportedExtraField = {
  column: number; // 1-based Excel column; duplicate headings remain distinct.
  heading: string;
  originalValue: string;
  value: string;
  target: ExtraProfileField | null;
};
export const MAX_EXTRA_FIELDS = 100;
export const MAX_EXTRA_BYTES = 48_000;
export class ExtraFieldsError extends Error {}
export function isExtraProfileField(value: unknown): value is ExtraProfileField {
  return typeof value === 'string' && EXTRA_PROFILE_FIELDS.some(f => f.key === value);
}
export function excelColumn(column: number): string {
  let result = '';
  while (column > 0) { column--; result = String.fromCharCode(65 + column % 26) + result; column = Math.floor(column / 26); }
  return result;
}
/** Copy only documented properties. Never spread imported JSON into employee data. */
export function readExtraFields(input: unknown): ImportedExtraField[] {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > MAX_EXTRA_FIELDS) throw new ExtraFieldsError('Keep at most 100 additional columns per record.');
  const columns = new Set<number>();
  const result = input.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ExtraFieldsError('An additional field is invalid.');
    const e = entry as Record<string, unknown>;
    if (!Number.isInteger(e.column) || Number(e.column) < 1 || Number(e.column) > 16384 || columns.has(Number(e.column)))
      throw new ExtraFieldsError('Additional fields must have distinct Excel column numbers.');
    columns.add(Number(e.column));
    for (const key of ['heading', 'originalValue', 'value'] as const) {
      if (typeof e[key] !== 'string' || e[key].length > (key === 'heading' ? 200 : 4000) || e[key].includes('\u0000'))
        throw new ExtraFieldsError(key === 'heading' ? 'An additional heading exceeds 200 characters or is invalid.' : 'An additional value exceeds 4,000 characters or is invalid.');
    }
    if (e.target !== null && !isExtraProfileField(e.target)) throw new ExtraFieldsError('Choose a supported profile field or keep this as extra information.');
    return { column: Number(e.column), heading: e.heading as string, originalValue: e.originalValue as string,
      value: e.value as string, target: e.target as ExtraProfileField | null };
  }).sort((a, b) => a.column - b.column);
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_EXTRA_BYTES) throw new ExtraFieldsError('Additional information exceeds 48 KB for this record. Ignore unnecessary columns or shorten large values.');
  return result;
}
/** Editing changes the chosen target/current value, never the imported evidence. */
export function reviseExtraFields(stored: unknown, incoming: unknown): ImportedExtraField[] {
  const original = readExtraFields(stored), changes = readExtraFields(incoming);
  if (original.length !== changes.length || original.some((e, i) => e.column !== changes[i]?.column))
    throw new ExtraFieldsError('The additional columns changed. Refresh this record before saving.');
  return readExtraFields(original.map((e, i) => ({...e, value: changes[i].value, target: changes[i].target})));
}
export type ExtraProfileData = Partial<Record<Exclude<ExtraProfileField, 'trainingNeeded' | 'skillLevel'>, string | null>> & {
  trainingNeeded?: boolean | null; skillLevel?: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LEVEL_4' | null;
};
export type ExtraFinding = { field: 'extraFields'; column?: number; message: string };
export function extraProfileData(input: unknown, phone: (value: string) => string | null, today = new Date().toISOString().slice(0, 10)) {
  const findings: ExtraFinding[] = [];
  let fields: ImportedExtraField[];
  try { fields = readExtraFields(input); } catch (error) {
    if (!(error instanceof ExtraFieldsError)) throw error;
    return { data: {} as ExtraProfileData, findings: [{field: 'extraFields', message: error.message}] as ExtraFinding[] };
  }
  const data: ExtraProfileData = {};
  const assigned = new Set<ExtraProfileField>();
  for (const f of fields) {
    if (!f.target) continue;
    const config = EXTRA_PROFILE_FIELDS.find(x => x.key === f.target)!;
    const problem = (message: string) => findings.push({field: 'extraFields', column: f.column, message: `${config.label} (column ${excelColumn(f.column)}): ${message}`});
    if (assigned.has(f.target)) { problem('Two columns map here. Keep one mapping and retain the other as extra information.'); continue; }
    assigned.add(f.target);
    const value = f.value.trim();
    const blank = !value || /^(?:n\/?a|not applicable|nil|none|null|no information available|-+)$/i.test(value);
    if (blank) { Object.assign(data, {[f.target]: null}); continue; }
    if (config.kind === 'date') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const date = match ? new Date(value + 'T00:00:00.000Z') : null;
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(match![1]) < 1900) {
        problem('Use a real date as YYYY-MM-DD (1900 or later).'); continue;
      }
      if (f.target === 'dateOfBirth' && value > today) { problem('Date of birth cannot be in the future.'); continue; }
      Object.assign(data, {[f.target]: date.toISOString()});
    } else if (config.kind === 'boolean') {
      if (!/^(?:yes|no|true|false|1|0)$/i.test(value)) { problem('Use Yes or No.'); continue; }
      data.trainingNeeded = /^(?:yes|true|1)$/i.test(value);
    } else if (config.kind === 'skill') {
      const match = /^(?:level[ _-]?)?([1-4])$/i.exec(value);
      if (!match) { problem('Use Level 1, Level 2, Level 3 or Level 4.'); continue; }
      data.skillLevel = `LEVEL_${match[1]}` as NonNullable<ExtraProfileData['skillLevel']>;
    } else if (config.kind === 'phone') {
      const normalised = phone(value);
      if (!normalised) { problem('Enter a valid phone number and check the import’s default country.'); continue; }
      data.emergencyContactPhone = normalised;
    } else Object.assign(data, {[f.target]: value});
  }
  return {data, findings};
}
