/**
 * 02.02 · Positions, roles & reporting relationships.
 *
 * The shapes other areas use (PositionChart, PersonDetails, DetailTier, PositionsProvider…) live in
 * common/contracts.ts (Area 02 section) and are re-exported here so Area 02's own files keep their imports.
 * What stays here is internal to Area 02: the interface a positions SOURCE implements, and its injection token.
 * EMS is the source of truth. Until EMS keeps position records, a temporary read-only source
 * (core-records-positions.source.ts) works positions out from people's job titles and reporting lines.
 */
import type { DetailTier, PersonDetails, PositionChart } from '../../common/contracts';
export type {
  PositionHolder,
  Position,
  PositionCheck,
  PositionChart,
  DetailTier,
  PersonDetails,
  PositionsProvider,
} from '../../common/contracts';

/** What a positions source provides (today the temporary core-records source; EMS's service after the merge). */
export interface PositionChartProvider {
  getPositions(organizationId: string): Promise<PositionChart>;
  /** The viewer's tier for one person (by their BEES role and the reporting lines). */
  tierFor(organizationId: string, userId: string, employeeId: string): Promise<DetailTier>;
  /** One person's details, limited to the tier; null when they're not an active member of this company. */
  getPerson(organizationId: string, employeeId: string, tier: DetailTier): Promise<PersonDetails | null>;
}

/** Nest injection token for whichever source currently provides positions (temporary core records, then EMS). */
export const POSITION_CHART_SOURCE = Symbol('POSITION_CHART_SOURCE');
