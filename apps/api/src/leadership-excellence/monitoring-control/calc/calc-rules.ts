/**
 * Calculation rules the SPMS guide says "must be defined and approved" (Part 5).
 * Values are placeholders until the business confirms them.
 */
export const CALC_RULES = {
  /** Cap on Achievement % for weighted scoring. null = no cap. TODO: confirm (100? 120?). */
  achievementCap: null as number | null,
  /** Lower-is-better KPI with actual 0 (e.g. 0 defects vs target 5). TODO: confirm. */
  lowerIsBetterZeroActual: null as number | null,
  /** Show negative Improvement Progress when actual is worse than baseline. TODO: confirm. */
  allowNegativeProgress: true,
} as const;
