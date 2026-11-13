/** Calendar dates are civil dates: comparisons never depend on a browser time zone. */
export function validCycleDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const n = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value;
}

export function cycleDateIssue(
  start: string,
  end: string,
  allowIncomplete = false,
): string {
  if ((start && !validCycleDate(start)) || (end && !validCycleDate(end)))
    return "Choose valid cycle dates.";
  if (
    (start && (start < "1900-01-01" || start > "2199-12-31")) ||
    (end && (end < "1900-01-01" || end > "2199-12-31"))
  )
    return "Choose cycle dates between 1900 and 2199.";
  if (!start || !end)
    return allowIncomplete
      ? ""
      : "Choose both cycle dates before previewing, submitting or approving.";
  if (end < start) return "Cycle ends must be on or after cycle starts.";
  if (
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000 >
    1098
  )
    return "Use a cycle of at most three years.";
  return "";
}
