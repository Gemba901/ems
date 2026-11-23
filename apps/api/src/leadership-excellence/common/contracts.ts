// ── 01 Strategic Direction → all later areas ─────────────────────────────

/** Lightweight status other areas read (02 header, 03 planning gate). */
export interface StrategicDirectionSummary {
  /** Approved company name; falls back to the current draft before first approval. */
  company: string;
  /** True once any version has been approved. */
  approved: boolean;
  /** Approved version number; null until the first approval. */
  version: number | null;
}

/** One core value as published (01.01). */
export interface CoreValue {
  id: string;
  name: string;
  why: string;
}

/**
 * The approved, locked company direction. Only approved content crosses
 * area boundaries — drafts and in-review revisions never leave Area 01.
 */
export interface ApprovedStrategicDirection {
  version: number;
  company: string;
  business: string;
  purpose: string;
  vision: string;
  visionWhy: string;
  mission: string;
  missionWhy: string;
  values: CoreValue[];
  approvedAt: Date;
  approvedById: string | null;
}

/** The six fixed BEES pillars (01.02). Reference data; never edited by orgs. */
export const LEX_PILLARS = [
  { code: 'LEX', name: 'Leadership Excellence' },
  { code: 'PEX', name: 'People Excellence' },
  { code: 'OPX', name: 'Operational Excellence' },
  { code: 'CMX', name: 'Customer & Market Excellence' },
  { code: 'SGEX', name: 'Sustainability & Governance Excellence' },
  { code: 'FPEX', name: 'Financial Performance Excellence' },
] as const;
export type LexPillarCode = (typeof LEX_PILLARS)[number]['code'];

/**
 * What StrategicDirectionService exports to other areas. Later areas inject the
 * service and call only these methods.
 */
export interface StrategicDirectionProvider {
  getSummary(organizationId: string): Promise<StrategicDirectionSummary>;
  /** Null until the first approval. */
  getApproved(organizationId: string): Promise<ApprovedStrategicDirection | null>;
}

// ── 02 Organisation Framework → later areas ──────────────────────────────
//
// Read-only views of the organisation (02.01, 02.02) and the approved performance calendars (02.03).
// The organisation views read the shared EMS service; corrections are made in EMS.
// Only approved calendar versions cross area
// boundaries — drafts and in-review revisions never leave Area 02.

// 02.01 · Organogram: the company's units (company → branch → department → section).

export type OrganisationUnitType = 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'SECTION';

export interface UnitLead {
  employeeId: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  basis: 'RECORDED_HOD' | 'INFERRED_FROM_REPORTING';
}

/** Active includes probation. These are overlapping figures, not four additive categories. */
export interface UnitPeople {
  total: number;
  active: number;
  probation: number;
  inactive: number;
}

export interface OrganisationUnit {
  /** Derived branch/section references change when source labels change. Department identity is departmentId. */
  id: string;
  parentId: string | null;
  type: OrganisationUnitType;
  name: string;
  departmentId: string | null;
  branch: string | null;
  lead: UnitLead | null;
  /** Present on department occurrences supplied by EMS; no inferred HOD fallback. */
  hodState?: 'ASSIGNED' | 'PENDING' | 'UNASSIGNED' | 'NOT_RECORDED' | 'NEEDS_ATTENTION';
  people: UnitPeople;
}

/** Minimal directory data for a unit; no contacts, account IDs or personal identifiers. */
export interface StructurePerson {
  id: string;
  unitId: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  active: boolean;
  probation: boolean;
}

export interface StructureCheck {
  kind: 'NO_DEPARTMENT' | 'EMPTY_DEPARTMENT' | 'NO_LEAD' | 'NO_MANAGER' | 'MANAGER_MISSING' | 'MANAGER_INACTIVE' | 'REPORTING_LOOP';
  severity: 'ERROR' | 'WARNING';
  count: number;
  unitId: string | null;
  message: string;
}

export interface OrganisationStructure {
  source: { kind: 'EMS' | 'CORE_RECORDS' | 'SAMPLE'; label: string; loadedAt: string };
  company: { id: string; name: string };
  multiBranch: boolean;
  units: OrganisationUnit[];
  members: StructurePerson[];
  people: UnitPeople & { withoutDepartment: number };
  checks: StructureCheck[];
}

/** What OrganogramService exports to other areas. Descriptive data, not plan responsibilities or permissions. */
export interface OrganisationStructureProvider {
  getStructure(organizationId: string): Promise<OrganisationStructure>;
}

// 02.02 · Positions & reporting: positions (roles), who holds each one, and which position each reports to.
// Until EMS keeps position records, positions are worked out from people's job titles and reporting lines
// (basis INFERRED_FROM_PEOPLE): their IDs are derived, not stable — never pin plan responsibilities to them.

export interface PositionHolder { employeeId: string; name: string; status: 'ACTIVE' | 'PROBATION' }

export interface Position {
  /** `pos:<employeeId>` for one person's position, `group:<parentId>:<title>` for a shared role (while inferred). */
  id: string;
  /** The position this one reports to; null at the top. */
  parentId: string | null;
  title: string;
  unit: { departmentId: string | null; name: string; branch: string | null } | null;
  /** Several holders = one role held by several people with nobody reporting to them. */
  holders: PositionHolder[];
  /** Always false while inferred (a vacancy needs position records in EMS). */
  vacant: boolean;
  basis: 'RECORDED' | 'INFERRED_FROM_PEOPLE';
}

/** A gap in the source records: shown, never fixed here (corrections are made in EMS). */
export interface PositionCheck {
  kind: 'NO_MANAGER' | 'MANAGER_MISSING' | 'MANAGER_INACTIVE' | 'REPORTING_LOOP' | 'NO_JOB_TITLE';
  severity: 'ERROR' | 'WARNING';
  count: number;
  /** Who is affected (names), and their employee IDs in the same order. */
  people: string[];
  employeeIds: string[];
  message: string;
}

export interface PositionChart {
  source: { kind: 'EMS' | 'CORE_RECORDS' | 'SAMPLE'; label: string; loadedAt: string };
  company: { id: string; name: string };
  multiBranch: boolean;
  positions: Position[];
  /** People on the chart (active and probation), and people left off it because their reporting is broken. */
  people: { onChart: number; probation: number; notConnected: number };
  checks: PositionCheck[];
}

/**
 * How much of a person's record a viewer may see (decided on the server, by BEES role and reporting lines):
 * BASIC — everyone in LEX; MANAGER — managers for people below them (and anyone for themselves), MANAGEMENT for
 * everyone; FULL — SUPER_ADMIN, ADMIN and HR for everyone. Personal and sensitive details are never sent by LEX.
 */
export type DetailTier = 'BASIC' | 'MANAGER' | 'FULL';

export interface PersonDetails {
  tier: DetailTier;
  employeeId: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: string | null;
  section: string | null;
  subSection: string | null;
  manager: { employeeId: string; name: string } | null;
  /** MANAGER and FULL only. */
  work?: {
    status: string; employmentType: string | null; dateJoined: string | null; shift: string | null; workStation: string | null;
    level: string | null; grade: string | null; skillLevel: string | null; trainingNeeded: boolean | null;
  };
  /** FULL only. */
  role?: {
    jobCategory: string | null; primaryWorkRole: string | null; machineProcess: string | null;
    hrRecordOwner: { employeeId: string; name: string } | null;
    canBeLeader: boolean; canBeMember: boolean; canBeAssignedTasks: boolean;
  };
  /** Positions held, moves and manager changes: filled once EMS provides it. */
  history: null;
  /** The person's EMS profile, when EMS pages are available to this viewer; null otherwise. */
  emsProfileUrl: string | null;
}

/** What PositionChartService exports to other areas. */
export interface PositionsProvider {
  getPositions(organizationId: string): Promise<PositionChart>;
  /** One person's details, limited to what the viewing user may see (the tier is worked out on the server). */
  getPerson(organizationId: string, viewerUserId: string, employeeId: string): Promise<PersonDetails>;
}

// 02.03 · Rules & calendar: approved performance calendars. Several calendars per company, assigned to the whole
// company, selected departments or selected people (person > department > company). Periods, deadlines and review
// dates are materialised at approval. Consumers pin calendarId AND version, and use the approved periods rather
// than recomputing them from the rules.

export const CALENDAR_FREQUENCIES = [
  'daily', 'weekly', 'fortnightly', 'twice-monthly', 'monthly', 'every-two-months', 'custom', 'quarterly', 'half-yearly', 'yearly',
] as const;
export type CalendarFrequency = (typeof CALENDAR_FREQUENCIES)[number];

export const CALENDAR_RESPONSIBILITIES = [
  'DEPARTMENT_HOD', 'DEPARTMENT_SUPERVISOR', 'LINE_MANAGER', 'PLAN_OWNER', 'PLAN_ASSIGNEE', 'AUTHORISED_APPROVER', 'SELECT_IN_PLAN',
] as const;
/** A default role in a plan. Describes who is expected to act; never grants approval permission by itself. */
export type CalendarResponsibility = (typeof CALENDAR_RESPONSIBILITIES)[number];

export const CALENDAR_TARGET_DIRECTIONS = ['higher', 'lower', 'range', 'milestone', 'zero-target'] as const;

/** Who an approved calendar applies to. Audiences are calendar settings, not organisation master records. */
export interface CalendarAudience {
  kind: 'UNASSIGNED' | 'COMPANY' | 'DEPARTMENTS' | 'PEOPLE';
  label: string;
  departmentIds: string[];
  employeeIds: string[];
}

export interface CalendarException {
  date: string;
  kind: 'NON_WORKING' | 'WORKING';
  reason: string;
  source: 'MANUAL' | 'HOLIDAY_SUGGESTION';
  category?: 'PUBLIC_HOLIDAY' | 'OBSERVED_PUBLIC_HOLIDAY' | 'OPTIONAL_CLOSURE';
  originalDate?: string;
  holidayCountry?: string;
}

export interface CalendarRules {
  audience?: CalendarAudience;
  name: string;
  start: string;
  end: string;
  timeZone: string;
  country: string;
  workdays: number[];
  exceptions: CalendarException[];
  // Missing on earlier drafts: retain the original eight frequencies.
  enabledFrequencies?: CalendarFrequency[];
  customInterval?: { every: number; unit: 'DAYS' | 'WEEKS' | 'MONTHS'; anchor: string };
  twoMonthAnchor?: string;
  verificationBasis?: 'SUBMISSION_DEADLINE' | 'ACTUAL_SUBMISSION';
  verificationDayType?: 'CALENDAR' | 'WORKING';
  verificationRoll?: 'NONE' | 'NEXT_WORKING';
  reviewDayType?: 'CALENDAR' | 'WORKING';
  reviewRoll?: 'NONE' | 'NEXT_WORKING';
  holidayOmissions?: { date: string; name: string; country: string; reason: string }[];
  weekStart: number;
  fortnightAnchor: string;
  splitDay: number;
  submissionDays: number;
  submissionDayType: 'CALENDAR' | 'WORKING';
  submissionRoll: 'NONE' | 'NEXT_WORKING';
  submissionTime: string;
  verificationDays: number;
  reviewFrequency: CalendarFrequency;
  reviewDays: number;
  responsibilities: { owner: CalendarResponsibility; provider: CalendarResponsibility; verifier: CalendarResponsibility; approver: CalendarResponsibility };
  directions: (typeof CALENDAR_TARGET_DIRECTIONS)[number][];
}

export interface CalendarPeriod {
  key: string;
  frequency: CalendarFrequency;
  start: string;
  end: string;
  naturalStart: string;
  naturalEnd: string;
  partial: boolean;
  workingDays: number;
  scheduled: boolean;
  reasons: string[];
  /** Civil date/time in the calendar's time zone, deliberately not an invented UTC timestamp. */
  submitBy: { date: string; time: string; timeZone: string } | null;
  verifyBy: string | null;
  verificationPendingSubmission?: boolean;
}

export interface ApprovedCalendarSnapshot {
  format: 1 | 2;
  warnings?: string[];
  rules: CalendarRules;
  /** Materialised on approval: later code changes cannot alter old periods. */
  periods: Partial<Record<CalendarFrequency, CalendarPeriod[]>>;
  reviews: { start: string; end: string; completeBy: string | null }[];
}

export interface ApprovedPerformanceCalendar extends ApprovedCalendarSnapshot {
  calendarId: string;
  organizationId: string;
  version: number;
  approvedAt: string;
  approvedByUserId: string;
}

/** One approved calendar as offered for selection (its current approved version). */
export interface ApprovedCalendarSummary {
  calendarId: string;
  version: number;
  name: string;
  start: string;
  end: string;
  timeZone: string;
  audience: { kind: CalendarAudience['kind']; label: string };
  /** Frequencies people on this calendar can report on. */
  frequencies: CalendarFrequency[];
}

/** Which approved calendar applies; on a tie at the same level it never guesses (CONFLICT, with the candidates). */
export interface CalendarAssignmentResult {
  status: 'ASSIGNED' | 'UNASSIGNED' | 'CONFLICT' | 'INACTIVE';
  basis: 'CURRENT_PEOPLE_RECORDS';
  calendarId?: string;
  version?: number;
  candidates: { calendarId: string; version: number; name: string }[];
}

/**
 * What RulesCalendarService exports to other areas. Assignment answers use current people records, not historical
 * employment: the consumer confirms and pins calendarId + version, and existing plans never silently rebind.
 */
export interface PerformanceCalendarProvider {
  /** Approved snapshots only; null when that calendar or version isn't approved. Never substitutes the latest for a missing version. */
  getApproved(organizationId: string, calendarId: string, version?: number): Promise<ApprovedPerformanceCalendar | null>;
  /** The company's current approved calendars, to offer as choices. */
  listApproved(organizationId: string): Promise<ApprovedCalendarSummary[]>;
  /** Which calendar applies to a person on a date (their own, then their department's, then company-wide). */
  getCurrentAssignment(organizationId: string, employeeId: string, localDate: string): Promise<CalendarAssignmentResult>;
  /** Which calendar applies to a department on a date (the department's, then company-wide). */
  getDepartmentAssignment(organizationId: string, departmentId: string, localDate: string): Promise<CalendarAssignmentResult>;
}
