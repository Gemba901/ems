import type { OnboardingBatchDetail, ReportingOption } from '@/services/ems.service';
import { hodBranchNeedsConfirmation } from './OnboardingHodChooser';

/** A department (and branch) whose HOD the import suggests unanimously and that still needs HR's confirmation. */
export type SuggestedHod = {
  key: string; recordId: string; departmentName: string; branchLabel: string;
  target: string; person: ReportingOption; count: number; total: number; version: string;
};

/**
 * Departments ready to confirm together: every record in the department and branch names the same HOD, nobody
 * left it blank, the suggested person is a known option, and the person is based in that branch.
 * Anything less clear (disagreement, blanks, a person from another branch) stays for an individual choice.
 */
export function suggestedHodConfirmations(batch: OnboardingBatchDetail | undefined): { ready: SuggestedHod[]; individual: number } {
  const links = batch?.peopleLinks;
  if (!batch || !links) return { ready: [], individual: 0 };
  const options = new Map((links.options ?? []).map(option => [option.target, option]));
  const seen = new Set<string>(), ready: SuggestedHod[] = [];
  let individual = 0;
  for (const record of batch.records) {
    if (record.status === 'EXCLUDED' || record.status === 'REGISTERED') continue;
    const hod = links.byRecord[record.id]?.hod;
    if (!hod?.departmentId) continue;
    const key = hod.evidenceKey || `${hod.departmentId}|${hod.branchKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const needsConfirmation = !hod.reviewKey || !!hod.error;
    if (!needsConfirmation) continue;
    const evidence = hod.evidenceKey ? links.hodEvidence?.[hod.evidenceKey] : undefined;
    const person = hod.suggestedTarget ? options.get(hod.suggestedTarget) : undefined;
    const branch = hod.branchLabel === 'Branch not specified' ? '' : hod.branchLabel;
    const unanimous = !!evidence && evidence.groups.length === 1 && evidence.blank === 0 && !!evidence.groups[0].name;
    if (!person || !unanimous || hodBranchNeedsConfirmation(person, branch)) { individual++; continue; }
    ready.push({ key, recordId: record.id, departmentName: hod.departmentName, branchLabel: hod.branchLabel,
      target: person.target, person, count: evidence!.groups[0].count, total: evidence!.total, version: hod.version });
  }
  ready.sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.branchLabel.localeCompare(b.branchLabel));
  return { ready, individual };
}
