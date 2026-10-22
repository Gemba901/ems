import { EXTRA_PROFILE_FIELDS, type ExtraProfileField } from '../../../components/ems/onboarding-extra-fields';
import type { CommunicationChannel, UpdateOnboardingRecordPayload } from "@/services/ems.service";

export type Field = Exclude<keyof UpdateOnboardingRecordPayload, "extraFields">;

/** Core record fields, a split full name, retained extras, or an explicit existing-profile target. */
export type MapField = Field | "fullName" | "extra" | `profile:${ExtraProfileField}`;

/** Workbook Position/Role wording is another spelling of these existing title fields.
 * Keep the person prefix: a bare Role or Position ID must not become a job title.
 */
const POSITION_ROLE_HEADERS: Record<string, MapField> = {};
const TITLE_HEADER_GROUPS: { prefixes: string[]; field: Field }[] = [
  { prefixes: ['job'], field: 'jobDesignation' },
  { prefixes: ['hod', 'headofdepartment'], field: 'hodDesignation' },
  { prefixes: ['reportingto', 'reportingmanager'], field: 'reportingToDesignation' },
  { prefixes: ['reliever1', 'firstreliever', '1streliever'], field: 'reliever1Designation' },
  { prefixes: ['reliever2', 'secondreliever', '2ndreliever'], field: 'reliever2Designation' },
];
for (const { prefixes, field } of TITLE_HEADER_GROUPS) {
  for (const prefix of prefixes) {
    for (const suffix of ['position', 'pos', 'positionrole', 'posrole']) {
      POSITION_ROLE_HEADERS[prefix + suffix] = field;
      if (prefix !== 'job') POSITION_ROLE_HEADERS[prefix + 'job' + suffix] = field;
    }
  }
}

/** Spreadsheet header text → record field. Keys are normalised (lowercase, no spaces/punctuation). */
const HEADER_MAP: Record<string, MapField> = {
  ...POSITION_ROLE_HEADERS,
  '5slocationcategory': 'fiveSLocationCategory',
  '5slocationcategiry': 'fiveSLocationCategory',
  '5scategory': 'fiveSLocationCategory',
  'fiveslocationcategory': 'fiveSLocationCategory',
  'fivescategory': 'fiveSLocationCategory',
  // Current headings and historical synonyms share the same stored fields.
  jobtitle:               "jobDesignation",
  jobposition:            "jobDesignation",
  hodjobtitle:            "hodDesignation",
  hodtitle:               "hodDesignation",
  reportingtojobtitle:    "reportingToDesignation",
  reportingtotitle:       "reportingToDesignation",
  reportingmanagerjobtitle: "reportingToDesignation",
  reliever1jobtitle:      "reliever1Designation",
  firstrelieverjobtitle:  "reliever1Designation",
  "1strelieverjobtitle":  "reliever1Designation",
  "1strelieverdesignation": "reliever1Designation",
  firstrelieverdesignation: "reliever1Designation",
  reliever2jobtitle:      "reliever2Designation",
  secondrelieverjobtitle: "reliever2Designation",
  "2ndrelieverjobtitle":  "reliever2Designation",
  "2ndrelieverdesignation": "reliever2Designation",
  secondrelieverdesignation: "reliever2Designation",
  emailaddress:          "workEmail",
  workemailaddress:      "workEmail",
  personalemail:         "workEmail",
  personalemailaddress:  "workEmail",
  companycode:            "companyCode",
  plantbranchcode:        "plantBranchCode",
  plantbranch:            "plantBranchCode",
  employeecode:           "employeeCode",
  employeeno:             "employeeCode",
  firstname:              "firstName",
  middlename:             "middleName",
  lastname:               "lastName",
  surname:                "lastName",
  fullname:               "fullName",
  fullnames:              "fullName",
  employeename:           "fullName",
  employeefullname:       "fullName",
  name:                   "fullName",
  names:                  "fullName",
  mobilenumber:           "mobileNumber",
  mobile:                 "mobileNumber",
  phone:                  "mobileNumber",
  whatsappnumber:         "whatsappNumber",
  whatsappno:             "whatsappNumber",
  whatsapp:               "whatsappNumber",
  whatsappcontact:        "whatsappNumber",
  personalmobilenumber:   "mobileNumber",
  personalmobilenumberlogin: "mobileNumber",
  workemail:              "workEmail",
  companyemail:           "workEmail",
  emailid:                "workEmail",
  email:                  "workEmail",
  gender:                 "gender",
  nationality:            "nationality",
  currentdepartment:      "currentDepartment",
  department:             "currentDepartment",
  hodname:                "hodName",
  hoddesignation:         "hodDesignation",
  workarea:               "workArea",
  workstation:            "workArea",
  subsection:             "subSection",
  jobdesignation:         "jobDesignation",
  designation:            "jobDesignation",
  beesaccesslevel:        "beesAccessLevel",
  accesslevel:            "beesAccessLevel",
  shift:                  "shift",
  reportingtoname:        "reportingToName",
  reportingto:            "reportingToName",
  reportingtodesignation: "reportingToDesignation",
  employmentstatus:       "employmentStatus",
  employmenttype:         "employmentType",
  reliever1name:          "reliever1Name",
  firstrelievername:      "reliever1Name",
  reliever1designation:   "reliever1Designation",
  reliever2name:          "reliever2Name",
  secondrelievername:     "reliever2Name",
  reliever2designation:   "reliever2Designation",

  employeenumber:   "employeeCode",
  staffid:          "employeeCode",
  company:          "companyCode",
  divisionplant:    "plantBranchCode",
  plantdepartment:  "currentDepartment",
  workareasection:  "workArea",
  beesaccesslevels: "beesAccessLevel",
  accesslevels:     "beesAccessLevel",
};

export function normaliseHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapHeaders(headerRow: unknown[]): (MapField | null)[] {
  return headerRow.map((cell) => {
    const key = normaliseHeader(cell);
    const additional = EXTRA_PROFILE_FIELDS.find(f => normaliseHeader(f.key) === key || normaliseHeader(f.label) === key);
    return HEADER_MAP[key] ?? (additional ? `profile:${additional.key}` as MapField : key === 'dob' ? 'profile:dateOfBirth' : null);
  });
}

/** How many cells in this row match a known header. */
export function scoreHeaderRow(row: unknown[]): number {
  return mapHeaders(row).filter(Boolean).length;
}

/**
 * Find the row most likely to be the header.
 * Returns its index, or -1 if nothing in range matched.
 */
export function findHeaderRow(grid: unknown[][], searchDepth = 20): number {
  let bestIndex = -1;
  let bestScore = 0;

const limit = Math.min(searchDepth, grid.length);
  for (let i = 0; i < limit; i++) {
    const score = scoreHeaderRow(grid[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // One stray match is more likely a coincidence than a header row.
  return bestScore >= 2 ? bestIndex : -1;
}

/** Every field a column can map to, in the order shown in the picker. */
export const MAPPABLE_FIELDS: { key: MapField; label: string }[] = [
  { key: "employeeCode",           label: "Employee code" },
  { key: "fullName",               label: "Full name (split into first, middle, last)" },
  { key: "firstName",              label: "First name" },
  { key: "middleName",             label: "Middle name" },
  { key: "lastName",               label: "Last name" },
  { key: "gender",                 label: "Gender" },
  { key: "nationality",            label: "Nationality" },
  { key: "mobileNumber",           label: "Personal mobile number (login)" },
  { key: "whatsappNumber",         label: "WhatsApp number" },
  { key: "workEmail",              label: "Email" },
  { key: "companyCode",            label: "Company code" },
  { key: "plantBranchCode",        label: "Plant / branch code" },
  { key: "currentDepartment",      label: "Department" },
  { key: "jobDesignation",         label: "Job title" },
  { key: "workArea",               label: "Work area" },
  { key: "fiveSLocationCategory",    label: "5S location category" },
  { key: "subSection",             label: "Sub-section" },
  { key: "shift",                  label: "Shift" },
  { key: "employmentStatus",       label: "Employment status" },
  { key: "employmentType",         label: "Employment type" },
  { key: "beesAccessLevel",        label: "BEES access level" },
  { key: "hodName",                label: "HOD name" },
  { key: "hodDesignation",         label: "HOD job title" },
  { key: "reportingToName",        label: "Reporting to" },
  { key: "reportingToDesignation", label: "Reporting to job title" },
  { key: "reliever1Name",          label: "1st reliever" },
  { key: "reliever1Designation",   label: "1st reliever job title" },
  { key: "reliever2Name",          label: "2nd reliever" },
  { key: "reliever2Designation",   label: "2nd reliever job title" },
  ...EXTRA_PROFILE_FIELDS.map(f => ({key: `profile:${f.key}` as MapField, label: `${f.label} (profile)`})),
];

/** Fields every record needs, whatever the organisation's channel. Keep in sync with the API's validateOnboardingBatch. */
export const ALWAYS_REQUIRED_FIELDS: Field[] = [
  "employeeCode", "firstName", "lastName", "mobileNumber", "currentDepartment", "beesAccessLevel", "jobDesignation", "reportingToName", "reportingToDesignation",
];

/** The contact field each channel makes required. */
const CHANNEL_REQUIRED_FIELD: Record<CommunicationChannel, Field> = {
  WHATSAPP: "whatsappNumber",
  EMAIL:    "workEmail",
};

/** Every required field for this organisation. With no channel chosen yet, only the always-required ones. */
export function requiredFields(channel: CommunicationChannel | null): Set<Field> {
  const fields = new Set(ALWAYS_REQUIRED_FIELDS);
  if (channel) fields.add(CHANNEL_REQUIRED_FIELD[channel]);
  return fields;
}

/** How full names in a sheet are written. */
export type NameOrder = "FIRST_LAST" | "LAST_FIRST";

/** A word written entirely in capitals, e.g. "OTIENO", which conventionally marks the surname. */
function isCapitalised(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  return letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Split a full name into first, middle and last name.
 * If exactly one word is in capitals ("OTIENO Peter Kamau"), that word is the surname, whatever the order.
 * Otherwise the chosen order decides. A single word becomes the first name only, so validation flags the
 * missing last name rather than the page guessing.
 */
export function splitFullName(value: string, order: NameOrder): { firstName?: string; middleName?: string; lastName?: string } {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return {};
  if (words.length === 1) return { firstName: words[0] };

  const capitalised = words.map((w, i) => (isCapitalised(w) ? i : -1)).filter((i) => i >= 0);
  let surnameAt: number;
  if (capitalised.length === 1) surnameAt = capitalised[0];
  else surnameAt = order === "LAST_FIRST" ? 0 : words.length - 1;

  const rest = words.filter((_, i) => i !== surnameAt);
  return {
    firstName: rest[0],
    middleName: rest.slice(1).join(" ") || undefined,
    lastName: words[surnameAt],
  };
}

/** Two or more spreadsheet columns pointing at the same field. */
export type MappingConflict = { field: MapField; columns: number[] };

/**
 * Fields that more than one column maps to, e.g. "Department" and "Plant & Department" both auto-mapping
 * to Department. Each must be resolved to a single column before import, or a later column would
 * silently overwrite an earlier one. Full name versus First/Last name is not a conflict: they are
 * different fields, and separate name columns deliberately take precedence over the split.
 */
export function findMappingConflicts(mapping: (MapField | null)[]): MappingConflict[] {
  const byField = new Map<MapField, number[]>();
  mapping.forEach((field, col) => {
    if (field && field !== "extra") byField.set(field, [...(byField.get(field) ?? []), col]);
  });
  return [...byField.entries()]
    .filter(([, columns]) => columns.length > 1)
    .map(([field, columns]) => ({ field, columns }));
}
