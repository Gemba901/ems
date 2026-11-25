import type { AccessTokenPayload } from '../../auth/access-token-payload';

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
  /** Percentage weight of each pillar (01.02); the six add up to 100. */
  pillarWeights: PillarWeights;
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

/** Whole-number percentages per pillar. Later areas use them in weighted scores. */
export type PillarWeights = Record<LexPillarCode, number>;

/** Weights a company starts with; it may change them, but they must total 100. */
export const DEFAULT_PILLAR_WEIGHTS: PillarWeights = {
  LEX: 10,
  PEX: 20,
  OPX: 30,
  CMX: 20,
  SGEX: 10,
  FPEX: 10,
};

/**
 * What StrategicDirectionService exports to other areas. Later areas inject the
 * service and call only these methods.
 */
export interface StrategicDirectionProvider {
  getSummary(organizationId: string): Promise<StrategicDirectionSummary>;
  /** Null until the first approval. */
  getApproved(
    organizationId: string,
  ): Promise<ApprovedStrategicDirection | null>;
}

// ── 03 Performance Planning → 04 · 05 · 06 · 07 ──────────────────────────
// Served to Area 05 in-process from Area 04's execution workspace
// (monitoring-control/monitoring-control.execution-source.ts).
export type KpiDirection = 'higher' | 'lower' | 'range' | 'zero';
export type KpiAggregation =
  | 'sum'
  | 'ratio'
  | 'closing'
  | 'milestone'
  | 'average';

export interface KpiDefinitionSnapshot {
  name: string;
  unit: string;
  direction: KpiDirection;
  calc: 'direct' | 'ratio' | 'percent';
  aggregation: KpiAggregation;
  inputA?: string; // label, e.g. "Rejected units"
  inputB?: string; // label, e.g. "Inspected units"
}

export interface PeriodTarget {
  periodId: string;
  start: string; // YYYY-MM-DD
  end: string;
  scheduled: boolean;
  dueAt: string; // ISO; submission deadline from the Area 02 calendar
  value: number | null;
  upper?: number | null; // only for 'range'
}

export interface ApprovedKpiAssignment {
  id: string;
  code: string;
  /** Approved planning document; with planVersion it pins the exact targets. */
  documentId: string;
  planVersion: number;
  departmentId: string;
  goalId: string;
  definition: KpiDefinitionSnapshot;
  baseline: number | null;
  finalTarget: number | null;
  warningTolerance: number; // in the KPI unit; 0 = none
  ownerId: string; // employee ids
  providerId: string;
  verifierId: string;
}

/** An approved goal or objective (follow-ups hang under a department goal). */
export interface ApprovedGoal {
  id: string;
  documentId: string;
  kind: 'OBJECTIVE' | 'GOAL';
  title: string;
  ownerId: string; // employee id; may check completion of actions under it
  departmentId: string | null;
  parentId: string | null;
}

export interface PerformancePlanningProvider {
  /** One row per KPI assignment: its current approved version. */
  listApprovedAssignments(
    organizationId: string,
  ): Promise<ApprovedKpiAssignment[]>;
  /** Period targets pinned to one approved plan version. */
  getPeriodTargets(
    organizationId: string,
    assignmentId: string,
    ref: { documentId: string; version: number },
  ): Promise<PeriodTarget[]>;
  /** Approved goals and objectives. */
  listGoals(organizationId: string): Promise<ApprovedGoal[]>;
}

// ── 04 Execution → 05 ─────────────────────────────────────────────────────
export interface SubmittedResult {
  id: string;
  assignmentId: string;
  periodId: string;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  note: string | null;
  correctionReason: string | null; // required when replacing an official value
  submittedById: string;
  submittedAt: Date;
  assignment: ApprovedKpiAssignment; // snapshot at submission
  target: PeriodTarget;
}

/** A delivery or improvement action tracked in Area 04 (05.03 overdue alerts, follow-ups). */
export interface TrackedAction {
  id: string;
  title: string;
  ownerId: string;
  departmentId: string | null;
  assignmentId: string | null;
  dueAt: string; // ISO
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED' | 'CANCELLED';
  documentId?: string;
}

/** An action the owner marked ready for a completion check. */
export interface PendingActionCheck extends TrackedAction {
  goalId: string | null;
  ownerNote: string | null;
  evidence: string | null;
  updatedById: string;
  updatedAt: Date;
}

export interface FollowUpActionInput {
  goalId: string; // approved department goal
  title: string;
  ownerId: string;
  dueAt: string; // YYYY-MM-DD
  expected: string; // expected improvement
  evidence: string; // how completion will be checked
  sourceAlertKey: string; // Area 05 alert this follows up
}

/** An Area 04 result that is official (verified). A correction may be pending. */
export interface OfficialValue {
  submissionId: string;
  assignmentId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  target: PeriodTarget;
  verifiedById: string; // employee id
  verifiedAt: Date;
  revision: number; // 1 = first verification
}

/** Verify / return stop at the first refusal; `done` were already saved. */
export interface DecisionOutcome {
  done: string[];
  failed: { id: string; message: string } | null;
}

/**
 * Reads take the organisation and return everything; Area 05 applies its own
 * visibility rules. Changes take the signed-in user, so Area 04 enforces its
 * own permissions (assigned verifier, no self-verification, checker).
 */
export interface ExecutionProvider {
  /** Results in SUBMITTED state only. */
  listSubmitted(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<SubmittedResult[]>;
  /** Official values. Area 04 stores them; Area 05 never keeps a copy. */
  listOfficial(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<OfficialValue[]>;
  listActions(organizationId: string): Promise<TrackedAction[]>;
  getAction(
    organizationId: string,
    actionId: string,
    documentId?: string,
  ): Promise<TrackedAction | null>;
  /** Actions the owner sent for a completion check that this user may check. */
  listActionsPendingCheck(
    user: AccessTokenPayload,
  ): Promise<PendingActionCheck[]>;
  checkActionCompletion(
    user: AccessTokenPayload,
    actionId: string,
    decision: { approve: boolean; note: string },
  ): Promise<TrackedAction>;
  /** Not offered by Area 04 yet (actions live in the Area 03 plans). */
  createFollowUpAction(
    user: AccessTokenPayload,
    input: FollowUpActionInput,
  ): Promise<TrackedAction>;
  /** Verify or return, one result at a time, in the order given. */
  decide(
    user: AccessTokenPayload,
    submissionIds: string[],
    decision: 'VERIFY' | 'RETURN',
    note: string,
  ): Promise<DecisionOutcome>;
}

// ── 05 Monitoring & Control → 06 · 07 ─────────────────────────────────────
export interface OfficialResult {
  assignmentId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  actual: number;
  target: PeriodTarget;
  verifiedById: string;
  verifiedAt: Date;
  revision: number;
}

export interface MonitoringProvider {
  getOfficialResults(
    organizationId: string,
    assignmentId: string,
  ): Promise<OfficialResult[]>;
}

// ── 02 Organisation Framework → later areas ──────────────────────────────
//
// Read-only views of the organisation (02.01, 02.02) and the approved performance calendars (02.03).
// The organisation views describe EMS's records (until EMS's service is connected, a temporary read-only source
// works from the core people records); corrections are made in EMS. Only approved calendar versions cross area
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
