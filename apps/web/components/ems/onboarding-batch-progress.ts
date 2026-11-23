import type { OnboardingBatchDetail, OnboardingBatchStatus, OnboardingRecord, ReportingResolution } from '@/services/ems.service';

/** Presentation only. Eligibility and registration remain API decisions. */
export function isChainFinding(field: string, resolution?: ReportingResolution) {
  return field === 'reportingToName' && resolution?.errorScope === 'UPSTREAM';
}

export function needsDuplicateReview(record: OnboardingRecord, resolution?: ReportingResolution) {
  return record.status === 'NEEDS_FIXING' && !!record.duplicateReview?.requiresReview
    && !!record.validationErrors?.length && record.validationErrors.every(finding =>
      finding.field === 'duplicateReview' || isChainFinding(finding.field, resolution));
}

export function waitingOnChain(record: OnboardingRecord, resolution?: ReportingResolution) {
  return record.status === 'NEEDS_FIXING' && !needsDuplicateReview(record, resolution)
    && resolution?.errorScope === 'UPSTREAM' && !!record.validationErrors?.length
    && record.validationErrors.every(finding => isChainFinding(finding.field, resolution) && finding.message === resolution.error);
}

export type BatchProgressCounts = {
  ready: number; registered: number; excluded: number; unchecked: number;
  needsFixing: number; needsReview: number; waiting: number;
};
export type BatchProgress = {
  counts: BatchProgressCounts; total: number; included: number; remaining: number;
  readyPercent: number | null; registeredPercent: number | null;
  label: string; cancelled: boolean; complete: boolean;
};

function percentage(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  // Never round incomplete work up to 100%, including very large imports.
  return numerator === denominator ? 100 : Math.min(99.9, Math.round(numerator / denominator * 1000) / 10);
}

type ProgressBatch = Pick<OnboardingBatchDetail, 'records' | 'status' | 'hierarchy'>;
export function summarizeBatchProgress(batch?: ProgressBatch): BatchProgress {
  const records = batch?.records ?? [];
  const counts: BatchProgressCounts = {ready:0, registered:0, excluded:0, unchecked:0, needsFixing:0, needsReview:0, waiting:0};
  for (const record of records) {
    switch (record.status) {
      case 'READY': counts.ready++; break;
      case 'REGISTERED': counts.registered++; break;
      case 'EXCLUDED': counts.excluded++; break;
      case 'DRAFT': counts.unchecked++; break;
      case 'NEEDS_FIXING': {
        const resolution = batch?.hierarchy.byRecord[record.id];
        if (needsDuplicateReview(record, resolution)) counts.needsReview++;
        else if (waitingOnChain(record, resolution)) counts.waiting++;
        else counts.needsFixing++;
        break;
      }
    }
  }
  const total = records.length, included = total - counts.excluded, remaining = included - counts.registered;
  const cancelled = batch?.status === 'CANCELLED';
  const complete = !cancelled && included > 0 && remaining === 0;
  const status: OnboardingBatchStatus = batch?.status ?? 'DRAFT';
  const label = cancelled ? 'Cancelled' : status === 'VALIDATING' ? 'Validating'
    : total === 0 ? 'Empty import'
    : included === 0 ? 'All records excluded'
    : complete ? counts.excluded ? 'Registered with exclusions' : 'Registered'
    : counts.registered > 0 ? 'Partially registered'
    : counts.ready === remaining ? 'Ready to register'
    : counts.unchecked === remaining ? 'Awaiting validation' : 'In progress';
  return {counts, total, included, remaining, label, cancelled, complete,
    readyPercent: percentage(counts.ready, remaining), registeredPercent: percentage(counts.registered, included)};
}
