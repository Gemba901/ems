import type { PlanningPeriod } from "../types";

// Replace with Performance Rules & Calendar; this module cannot edit periods.
export const planningPeriods: readonly PlanningPeriod[] = [
  {
    id: "demo-period-2026",
    name: "Performance year 2026",
    year: 2026,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  {
    id: "demo-period-2027",
    name: "Performance year 2027",
    year: 2027,
    startDate: "2027-01-01",
    endDate: "2027-12-31",
  },
];
