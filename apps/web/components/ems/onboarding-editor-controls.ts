import type {OnboardingRecord, ReportingResolution} from '@/services/ems.service';

export type DuplicateFilter = '' | 'REQUIRES_REVIEW' | 'REVIEWED' | 'NO_MATCHES';
export const DUPLICATE_FILTERS: {value: DuplicateFilter; label: string}[] = [
  {value: '', label: 'All duplicate checks'},
  {value: 'REQUIRES_REVIEW', label: 'Needs duplicate review'},
  {value: 'REVIEWED', label: 'Reviewed as distinct'},
  {value: 'NO_MATCHES', label: 'No current matches'},
];

/** Missing evidence is not evidence that someone is unique. */
export function duplicateFilterState(record: Pick<OnboardingRecord, 'duplicateReview'>): Exclude<DuplicateFilter, ''> | 'UNCHECKED' {
  const review = record.duplicateReview;
  if (!review) return 'UNCHECKED';
  const hard = review.hardConflicts.length > 0, possible = review.possibleMatches.length > 0;
  if (hard || review.requiresReview || review.blocked) return 'REQUIRES_REVIEW';
  if (!possible) return 'NO_MATCHES';
  return review.reviewed ? 'REVIEWED' : 'REQUIRES_REVIEW';
}

export function requestedPage(value: string, pages: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= pages ? page : null;
}

export function chainRegistrationNotice(record: Pick<OnboardingRecord, 'status'>, resolution?: ReportingResolution) {
  if (!resolution || record.status === 'EXCLUDED' || record.status === 'REGISTERED') return null;
  if (resolution.error && resolution.errorScope === 'UPSTREAM') return {
    kind: 'blocked' as const,
    heading: record.status === 'DRAFT' || record.status === 'READY' ? 'Reporting check needs refreshing' : 'Registration blocked by reporting chain',
    message: resolution.blocker
      ? `${resolution.blocker.label}: ${resolution.blocker.reason}`
      : resolution.error,
    next: 'Correct that reporting assignment, then validate this record again.',
  };
  if (!resolution.error && resolution.state === 'PENDING') return {
    kind: 'pending' as const,
    heading: 'Valid manager assignment pending',
    message: `${resolution.managerName || 'The selected manager'} has not registered yet.`,
    next: record.status === 'READY'
      ? 'This record can register now. The manager link will complete when the manager registers.'
      : 'The pending manager does not block registration. Resolve this record’s other findings and validate it.',
  };
  return null;
}
