/** Count units describe discrete items. Rates, money, time and other continuous
 * measures deliberately retain their own domain, including negative values. */
export function isCountUnit(unit: string | null | undefined): boolean {
  const normalized = (unit || '').trim().toLowerCase().replace(/\.$/, '');
  return /^(?:count|counts|number|numbers|no|nos|#|action|actions|item|items|unit|units|piece|pieces|pc|pcs|person|persons|people|employee|employees|headcount|event|events|incident|incidents|defect|defects|case|cases|complaint|complaints|order|orders|task|tasks|record|records|ticket|tickets|visit|visits|inspection|inspections|audit|audits|session|sessions|participant|participants|customer|customers|delivery|deliveries)$/.test(
    normalized,
  );
}

/** Missing values remain a draft/readiness concern for the caller. */
export function measurementValueIssue(
  unit: string | null | undefined,
  value: number | null | undefined,
  label = 'Value',
): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return `${label} must be a finite number.`;
  if (isCountUnit(unit) && (!Number.isSafeInteger(value) || value < 0))
    return `${label} in ${unit} must be a nonnegative whole number.`;
  return null;
}
