import { importedAccountRole } from './onboarding-access';
import { isBlankValue, isNotApplicable, normaliseKey } from './onboarding-text';

/**
 * "Treat as": one choice rewrites the same odd value in every unregistered record of an import
 * (e.g. every "Perm." in Employment type becomes Full time). Only fixed-list fields.
 * Keep the web copy (components/ems/onboarding-value-fixes.ts) in sync.
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

/** Only a blank employment status has a stated default (Active), so only that field takes "Set blanks to …". */
export const BLANK_FIX_FIELDS: readonly ValueFixField[] = ['employmentStatus'];

export function isValueFixField(value: unknown): value is ValueFixField {
  return typeof value === 'string' && (VALUE_FIX_FIELDS as readonly string[]).includes(value);
}

/** Blank, a placeholder like "nil", or N/A: all register the same way as an empty cell for these fields. */
export const isBlankForFix = (value: string | null | undefined) => isBlankValue(value) || isNotApplicable(value);

/** Does this record value belong to the group being fixed? Groups are case-, space- and punctuation-insensitive. */
export function matchesValueFix(value: string | null | undefined, fix: { from?: string | null; blanks?: boolean }): boolean {
  if (fix.blanks) return isBlankForFix(value);
  const key = normaliseKey(fix.from ?? null);
  return !!key && !isBlankForFix(value) && normaliseKey(value ?? null) === key;
}

/** Access above Employee needs an Admin, whether registered directly or mapped here. */
export function valueFixNeedsAdmin(field: ValueFixField, to: string): boolean {
  return field === 'beesAccessLevel' && to !== 'EMPLOYEE';
}

/** Sanity check: the written text must be recognised as the choice (guards the label tables above). */
export function valueFixText(field: ValueFixField, to: string): string | undefined {
  const text = VALUE_FIX_CHOICES[field][to];
  if (!text) return undefined;
  if (field === 'beesAccessLevel' && importedAccountRole(text) !== to) return undefined;
  return text;
}
