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

/** What Area 02 offers for 02.02. Later areas inject PositionChartService and call only this. */
export interface PositionChartProvider { getPositions(organizationId: string): Promise<PositionChart> }

/** Nest injection token for whichever source currently provides positions (temporary core records, then EMS). */
export const POSITION_CHART_SOURCE = Symbol('POSITION_CHART_SOURCE');
