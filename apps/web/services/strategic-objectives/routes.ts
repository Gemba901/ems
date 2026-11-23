export const STRATEGIC_OBJECTIVES_ROOT = "/leadership/strategic-objectives";
export const STRATEGIC_OBJECTIVES_ROUTES = {
  guide: STRATEGIC_OBJECTIVES_ROOT,
  register: `${STRATEGIC_OBJECTIVES_ROOT}/register`,
  create: `${STRATEGIC_OBJECTIVES_ROOT}/new`,
  goal: `${STRATEGIC_OBJECTIVES_ROOT}/goals/new`,
} as const;

// Only these synthetic-data preview pages may render without a live API session.
// Remove this exception when the approved module is connected to real data/auth.
export function isStrategicObjectivesDemoPath(pathname: string | null) {
  return Object.values(STRATEGIC_OBJECTIVES_ROUTES).some(
    (route) => route === pathname,
  );
}
