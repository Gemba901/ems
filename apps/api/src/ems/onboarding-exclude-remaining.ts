import { createHash } from 'node:crypto';

/** Records still waiting in an import: not registered and not already excluded. */
export const isRemainingRecord = (status: string) => status !== 'REGISTERED' && status !== 'EXCLUDED';

export type ExcludeRemainingLinkKind = 'REPORTING' | 'FIRST_RELIEVER' | 'SECOND_RELIEVER' | 'DEPARTMENT_HOD';

export interface ExcludeRemainingLink {
  kind: ExcludeRemainingLinkKind;
  /** The registered employee, or the department/branch, that is waiting. */
  subject: string;
  /** The unregistered person it is waiting for. */
  pendingName: string;
}

export interface ExcludeRemainingPreview {
  batchId: string;
  registered: number;
  alreadyExcluded: number;
  toExclude: number;
  byStatus: { READY: number; NEEDS_FIXING: number; DRAFT: number };
  affectedLinkCount: number;
  /** First 50 only, for the confirmation screen. affectedLinkCount is the full total. */
  affectedLinks: ExcludeRemainingLink[];
  /** Fingerprint of exactly which records will be excluded; required to confirm. */
  token: string;
}

type PlanRecord = { id: string; status: string; firstName?: string | null; lastName?: string | null; employeeCode?: string | null };
type PlanEmployee = { id: string; firstName?: string | null; lastName?: string | null;
  pendingReportingRecordId?: string | null; pendingFirstRelieverRecordId?: string | null; pendingSecondRelieverRecordId?: string | null };
type PlanHod = { pendingRecordId?: string | null; branchLabel?: string | null; department?: { name?: string | null } | null };

const MAX_LINKS = 50;
const personName = (p: { firstName?: string | null; lastName?: string | null; employeeCode?: string | null }) =>
  [p.firstName, p.lastName].map(v => v?.trim()).filter(Boolean).join(' ') || p.employeeCode?.trim() || 'Unnamed record';

/** Order-independent fingerprint of the records to be excluded. */
export function excludeRemainingToken(batchId: string, recordIds: string[]) {
  return createHash('sha256').update(`${batchId}\n${[...recordIds].sort().join('\n')}`).digest('hex');
}

export function buildExcludeRemainingPreview(batchId: string, records: PlanRecord[], employees: PlanEmployee[], hods: PlanHod[]): ExcludeRemainingPreview {
  const remaining = records.filter(r => isRemainingRecord(r.status));
  const names = new Map(remaining.map(r => [r.id, personName(r)]));
  const links: ExcludeRemainingLink[] = [];
  // Callers may over-fetch; only links to records being excluded count.
  for (const e of employees) {
    const subject = personName(e);
    const slots: [ExcludeRemainingLinkKind, string | null | undefined][] = [
      ['REPORTING', e.pendingReportingRecordId],
      ['FIRST_RELIEVER', e.pendingFirstRelieverRecordId],
      ['SECOND_RELIEVER', e.pendingSecondRelieverRecordId],
    ];
    for (const [kind, id] of slots) if (id && names.has(id)) links.push({ kind, subject, pendingName: names.get(id)! });
  }
  for (const h of hods) {
    if (!h.pendingRecordId || !names.has(h.pendingRecordId)) continue;
    const subject = [h.department?.name?.trim(), h.branchLabel?.trim()].filter(Boolean).join(' · ') || 'Department';
    links.push({ kind: 'DEPARTMENT_HOD', subject, pendingName: names.get(h.pendingRecordId)! });
  }
  links.sort((a, b) => a.subject.localeCompare(b.subject) || a.kind.localeCompare(b.kind));
  const count = (status: string) => remaining.filter(r => r.status === status).length;
  return {
    batchId,
    registered: records.filter(r => r.status === 'REGISTERED').length,
    alreadyExcluded: records.filter(r => r.status === 'EXCLUDED').length,
    toExclude: remaining.length,
    // VALIDATING or any other interim status is shown with "not yet validated".
    byStatus: { READY: count('READY'), NEEDS_FIXING: count('NEEDS_FIXING'), DRAFT: remaining.length - count('READY') - count('NEEDS_FIXING') },
    affectedLinkCount: links.length,
    affectedLinks: links.slice(0, MAX_LINKS),
    token: excludeRemainingToken(batchId, remaining.map(r => r.id)),
  };
}
