/**
 * 02.02 · Positions, roles & reporting relationships.
 *
 * The shapes other areas use (PositionChart, PersonDetails, DetailTier, PositionsProvider…) live in
 * common/contracts.ts (Area 02 section) and are re-exported here so Area 02's own files keep their imports.
 * What stays here is internal to Area 02: the interface a positions SOURCE implements, and its injection token.
 * The EMS adapter works out this display from employee job titles and reporting lines.
 * Its derived IDs cannot be used as recorded position IDs for plans.
 */
export type {
  PositionHolder,
  Position,
  PositionCheck,
  PositionChart,
  DetailTier,
  PersonDetails,
  PositionsProvider,
} from '../../common/contracts';

/** Atomic viewer-aware lookup; callers cannot supply a detail tier. */
export type PositionChartProvider = import('../../common/contracts').PositionsProvider;

/** Nest injection token for the EMS-backed positions source. */
export const POSITION_CHART_SOURCE = Symbol('POSITION_CHART_SOURCE');
