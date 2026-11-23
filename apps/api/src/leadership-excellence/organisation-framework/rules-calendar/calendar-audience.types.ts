// CalendarAudience and CalendarAssignmentResult cross area boundaries, so they live in common/contracts.ts
// (Area 02 section); re-exported here so Area 02's own files keep their imports.
import type { CalendarAudience } from "../../common/contracts";
export type { CalendarAudience, CalendarAssignmentResult } from "../../common/contracts";
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
