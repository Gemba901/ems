/**
 * 02.02 · What the position chart receives: positions (roles), who holds each one, and which position each reports to.
 *
 * DRAFT for Rodgers: this belongs in `common/contracts.ts` (Area 02 section) once reviewed; kept here until then so
 * nothing outside Area 02 depends on it. EMS is the source of truth. Until EMS keeps position records, a temporary
 * read-only source (core-records-positions.source.ts) works positions out from people's job titles and reporting lines.
 */

/** Someone holding a position. */
export interface PositionHolder { employeeId: string; name: string; status: 'ACTIVE' | 'PROBATION' }

export interface Position {
  /** Stable reference: `pos:<employeeId>` for one person's position, `group:<parentId>:<title>` for a shared role. */
  id: string;
  /** The position this one reports to; null at the top. */
  parentId: string | null;
  title: string;
  /** Where the position sits: department (and branch, when the company has several). */
  unit: { departmentId: string | null; name: string; branch: string | null } | null;
  /** Who holds it. Several holders = one role held by several people with nobody reporting to them (e.g. 13 operators). */
  holders: PositionHolder[];
  /** No holder. Only possible once EMS keeps position records; worked-out positions always have a holder. */
  vacant: boolean;
  /** How the position was known: recorded in EMS, or worked out from people's job titles and reporting lines. */
  basis: 'RECORDED' | 'INFERRED_FROM_PEOPLE';
}

/** A gap in the source records: shown, never fixed here (corrections are made in EMS). */
export interface PositionCheck {
  kind: 'NO_MANAGER' | 'MANAGER_MISSING' | 'MANAGER_INACTIVE' | 'REPORTING_LOOP' | 'NO_JOB_TITLE';
  severity: 'ERROR' | 'WARNING';
  count: number;
  /** Who is affected (names), so the person correcting EMS knows where to look. */
  people: string[];
  /** The same people's employee ids, in the same order (to open their details). */
  employeeIds: string[];
  message: string;
}

export interface PositionChart {
  source: { kind: 'EMS' | 'CORE_RECORDS' | 'SAMPLE'; label: string; loadedAt: string };
  company: { id: string; name: string };
  multiBranch: boolean;
  positions: Position[];
  /** People counted on the chart (active and probation), and people left off it because their reporting is broken. */
  people: { onChart: number; probation: number; notConnected: number };
  checks: PositionCheck[];
}

/**
 * How much of a person's record a viewer may see in LEX (decided on the server, by BEES role):
 * - BASIC: everyone in LEX — who and where (name, code, job title, department, branch, section, manager).
 * - MANAGER: managers for people below them in the reporting lines (and anyone for themselves); MANAGEMENT for
 *   everyone — adds work details (status, type, start date, shift, station, level, grade, skill).
 * - FULL: SUPER_ADMIN, ADMIN and HR for everyone — adds role details and the HR record owner.
 * Personal and sensitive details (contacts, ID numbers, birth date, address, emergency contacts) are never sent by LEX.
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
  /** Positions held, moves and manager changes: not kept in the core records; filled once EMS provides it. */
  history: null;
  /** The person's EMS profile, when EMS pages are available to this viewer; null otherwise. */
  emsProfileUrl: string | null;
}

/** What Area 02 offers for 02.02. Later areas inject PositionChartService and call only this. */
export interface PositionChartProvider {
  getPositions(organizationId: string): Promise<PositionChart>;
  /** The viewer's tier for one person (by their BEES role and the reporting lines). */
  tierFor(organizationId: string, userId: string, employeeId: string): Promise<DetailTier>;
  /** One person's details, limited to the tier; null when they're not an active member of this company. */
  getPerson(organizationId: string, employeeId: string, tier: DetailTier): Promise<PersonDetails | null>;
}

/** Nest injection token for whichever source currently provides positions (temporary core records, then EMS). */
export const POSITION_CHART_SOURCE = Symbol('POSITION_CHART_SOURCE');
