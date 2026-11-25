/**
 * Calculation rules the SPMS guide says "must be defined and approved" (Part 5).
 * Confirmed by the business on 2026-11-23.
 */
export const CALC_RULES = {
  /** Cap on Achievement % so one over-achieved KPI cannot hide misses. null = no cap. */
  achievementCap: 100 as number | null,
  /**
   * Lower-is-better KPI with actual 0 (e.g. 0 defects vs target 5): target/actual
   * divides by zero, so it scores the best possible value (the cap, else 100).
   */
  lowerIsBetterZeroActual: 'CAP' as const,
  /** Show negative Improvement Progress when actual is worse than baseline. */
  allowNegativeProgress: true,
  /**
   * Default "needs attention" band, as % of the target, used when Area 03 gives
   * no tolerance for a KPI. Each organisation can change it (LexMonitoringSettings).
   */
  defaultWarningTolerancePct: 5,
} as const;
