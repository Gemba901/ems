/** Fixed reporting roots, not employee roles or committee membership. Keep API/web copies identical. */
export const REPORTING_BODIES = [
  { value: 'BOARD', label: 'Board' },
  { value: 'COMMITTEE', label: 'Committee' },
  { value: 'MANAGEMENT_COMMITTEE', label: 'Management Committee' },
  { value: 'OWNER', label: 'Owner' },
] as const;
export type ReportingBody = typeof REPORTING_BODIES[number]['value'];
export function isReportingBody(value: unknown): value is ReportingBody {
  return REPORTING_BODIES.some(body => body.value === value);
}
export function reportingBodyLabel(value: unknown): string | null {
  return REPORTING_BODIES.find(body => body.value === value)?.label ?? null;
}
/** Only a blank reporting-person name allows designation-only root resolution. */
export function importedReportingBody(designation?: string | null): ReportingBody | null {
  const key = (designation ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (key === 'board of directors') return 'BOARD';
  return REPORTING_BODIES.find(body => body.label.toLowerCase() === key)?.value ?? null;
}
