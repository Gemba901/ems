import { UpdateOnboardingRecordPayload } from "@/services/ems.service";

export type Field = keyof UpdateOnboardingRecordPayload;

/** Spreadsheet header text → record field. Keys are normalised (lowercase, no spaces/punctuation). */
const HEADER_MAP: Record<string, Field> = {
  companycode:            "companyCode",
  plantbranchcode:        "plantBranchCode",
  plantbranch:            "plantBranchCode",
  employeecode:           "employeeCode",
  employeeno:             "employeeCode",
  firstname:              "firstName",
  middlename:             "middleName",
  lastname:               "lastName",
  surname:                "lastName",
  mobilenumber:           "mobileNumber",
  mobile:                 "mobileNumber",
  phone:                  "mobileNumber",
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

export function mapHeaders(headerRow: unknown[]): (Field | null)[] {
  return headerRow.map((cell) => HEADER_MAP[normaliseHeader(cell)] ?? null);
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
export const MAPPABLE_FIELDS: { key: Field; label: string }[] = [
  { key: "employeeCode",           label: "Employee code" },
  { key: "firstName",              label: "First name" },
  { key: "middleName",             label: "Middle name" },
  { key: "lastName",               label: "Last name" },
  { key: "gender",                 label: "Gender" },
  { key: "nationality",            label: "Nationality" },
  { key: "mobileNumber",           label: "Mobile number" },
  { key: "workEmail",              label: "Work email" },
  { key: "companyCode",            label: "Company code" },
  { key: "plantBranchCode",        label: "Plant / branch code" },
  { key: "currentDepartment",      label: "Department" },
  { key: "jobDesignation",         label: "Job designation" },
  { key: "workArea",               label: "Work area" },
  { key: "subSection",             label: "Sub-section" },
  { key: "shift",                  label: "Shift" },
  { key: "employmentStatus",       label: "Employment status" },
  { key: "employmentType",         label: "Employment type" },
  { key: "beesAccessLevel",        label: "BEES access level" },
  { key: "hodName",                label: "HOD name" },
  { key: "hodDesignation",         label: "HOD designation" },
  { key: "reportingToName",        label: "Reporting to" },
  { key: "reportingToDesignation", label: "Reporting to designation" },
  { key: "reliever1Name",          label: "1st reliever" },
  { key: "reliever1Designation",   label: "1st reliever designation" },
  { key: "reliever2Name",          label: "2nd reliever" },
  { key: "reliever2Designation",   label: "2nd reliever designation" },
];
