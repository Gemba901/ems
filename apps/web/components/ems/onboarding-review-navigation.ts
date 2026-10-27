// Only internal batch-record routes can be used as review return destinations.
const base = 'https://ems-review.invalid';

export function safeReviewReturn(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/ems/onboarding/') || value.length > 6000) return null;
  try {
    const url = new URL(value, base);
    const record = url.searchParams.get('record');
    if (url.origin !== base || !/^\/ems\/onboarding\/[^/]+$/.test(url.pathname) || !record || record.length > 200) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export function reviewRecordHref(batchId: string, recordId: string, returnTo?: string | null): string {
  const query = new URLSearchParams({ record: recordId });
  const safe = safeReviewReturn(returnTo);
  if (safe) query.set('returnTo', safe);
  return `/ems/onboarding/${encodeURIComponent(batchId)}?${query}`;
}

export function reviewEmployeeHref(employeeId: string, returnTo: string): string {
  const query = new URLSearchParams();
  const safe = safeReviewReturn(returnTo);
  if (safe) query.set('returnTo', safe);
  return `/ems/employees/${encodeURIComponent(employeeId)}${query.size ? `?${query}` : ''}`;
}

export function employeeBackDestination(search: string, historyLength: number): string | null {
  return safeReviewReturn(new URLSearchParams(search).get('returnTo'))
    ?? (historyLength > 1 ? null : '/ems/employees');
}
