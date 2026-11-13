/** Calendar audiences are approved calendar settings, not organisation master records. */
export interface CalendarAudience {
  kind: "UNASSIGNED" | "COMPANY" | "DEPARTMENTS" | "PEOPLE";
  label: string;
  departmentIds: string[];
  employeeIds: string[];
}
export interface CalendarDirectory {
  source: "CORE_RECORDS" | "EMS";
  loadedAt: string;
  departments: { id: string; name: string }[];
  people: {
    id: string;
    name: string;
    code: string | null;
    jobTitle: string | null;
    departmentId: string | null;
    branch: string | null;
    active: boolean;
  }[];
}
export interface AudienceConflict {
  calendarId: string;
  name: string;
  version: number;
  start: string;
  end: string;
  message: string;
}
export interface AudiencePreview {
  label: string;
  matchingActive: number;
  inactiveMembers: number;
  conflicts: AudienceConflict[];
  issues: string[];
}
export interface CalendarComparison {
  month: string;
  basis: "CURRENT_PEOPLE_RECORDS";
  generatedAt: string;
  activePeople: number;
  days: {
    date: string;
    assigned: number;
    conflicts: number;
    unassigned: number;
  }[];
  rows: {
    calendarId: string;
    version: number;
    name: string;
    audience: string;
    kind: CalendarAudience["kind"];
    start: string;
    end: string;
    country: string;
    timeZone: string;
    matchingActive: number;
    missingMembers: number;
    cells: {
      date: string;
      working: boolean | null;
      reason: string;
      effectivePeople: number;
      conflicts: number;
    }[];
  }[];
}
export interface CalendarAssignmentResult {
  status: "ASSIGNED" | "UNASSIGNED" | "CONFLICT" | "INACTIVE";
  basis: "CURRENT_PEOPLE_RECORDS";
  calendarId?: string;
  version?: number;
  candidates: { calendarId: string; version: number; name: string }[];
}
