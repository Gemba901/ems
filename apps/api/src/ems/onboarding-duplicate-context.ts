import { createDuplicateIndex, DuplicatePerson, DuplicateReview } from './onboarding-duplicates';
import { cleanRecord } from './onboarding-text';
import { normalisePhone } from './onboarding-phone';

export const ONBOARDING_TEXT_FIELDS = [
  'companyCode', 'plantBranchCode', 'employeeCode', 'firstName', 'middleName', 'lastName',
  'mobileNumber', 'whatsappNumber', 'workEmail', 'gender', 'nationality', 'currentDepartment',
  'hodName', 'hodDesignation', 'workArea', 'subSection', 'jobDesignation', 'beesAccessLevel',
  'shift', 'reportingToName', 'reportingToDesignation', 'employmentStatus', 'employmentType',
  'reliever1Name', 'reliever1Designation', 'reliever2Name', 'reliever2Designation',
] as const;

export interface DuplicateImportRow {
  id: string;
  batchId: string;
  rowNumber?: number | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  employeeCode: string | null;
  mobileNumber: string | null;
  currentDepartment: string | null;
  jobDesignation: string | null;
  plantBranchCode: string | null;
}

export function duplicateImportPerson(raw: DuplicateImportRow, organizationId: string, country: string | null): DuplicatePerson {
  const row = cleanRecord(raw);
  return { organizationId, kind: 'IMPORT', id: row.id, batchId: row.batchId, rowNumber: row.rowNumber,
    firstName: row.firstName, middleName: row.middleName, lastName: row.lastName,
    employeeCode: row.employeeCode, canonicalPhone: normalisePhone(row.mobileNumber, country),
    department: row.currentDepartment, designation: row.jobDesignation, branch: row.plantBranchCode };
}

export type DuplicateFinding = { field: string; message: string; code: 'DUPLICATE_PERSON' };
export function duplicateFindings(review: DuplicateReview): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];
  if (review.hardConflicts.some(match => match.reasons.includes('EMPLOYEE_CODE')))
    findings.push({ field: 'employeeCode', code: 'DUPLICATE_PERSON', message: 'This employee code is used by another employee or active import record. Review the matching people below.' });
  if (review.hardConflicts.some(match => match.reasons.includes('PERSONAL_MOBILE')))
    findings.push({ field: 'mobileNumber', code: 'DUPLICATE_PERSON', message: 'This personal mobile is already used by another record or employee in this organisation. Review the matching people below.' });
  if (review.requiresReview)
    findings.push({ field: 'duplicateReview', code: 'DUPLICATE_PERSON', message: 'Possible duplicate person. Review the matches and confirm only if this is a different person.' });
  return findings;
}

/** Refresh only findings owned by this feature; never clear unrelated validation. */
export function refreshedDuplicateRecord<T extends { status: string; validationErrors: unknown; duplicateReviewReceipt?: unknown }>(record: T, review: DuplicateReview | null) {
  const { duplicateReviewReceipt: _receipt, ...publicRecord } = record;
  if (!review) return { ...publicRecord, duplicateReview: null };
  const previous = Array.isArray(record.validationErrors) ? record.validationErrors : [];
  const findings = [...previous.filter(finding => finding?.code !== 'DUPLICATE_PERSON'), ...duplicateFindings(review)];
  // Draft still needs full validation. Excluded/registered records are never passed a review.
  const wasDuplicateBlocked = previous.some(finding => finding?.code === 'DUPLICATE_PERSON');
  const status = record.status === 'READY' || (record.status === 'NEEDS_FIXING' && wasDuplicateBlocked)
    ? findings.length ? 'NEEDS_FIXING' : 'READY' : record.status;
  return { ...publicRecord, status: status as T['status'], validationErrors: findings.length ? findings : null, duplicateReview: review };
}

export type DuplicateIndex = ReturnType<typeof createDuplicateIndex>;
