"use client";

import Link from "next/link";
import { reviewEmployeeHref, reviewRecordHref } from "./onboarding-review-navigation";
import { useEffect, useState } from "react";
import type { DuplicateMatch, DuplicateReview } from "@/services/ems.service";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

function Match({ person, batchId, originHref, onVisit }: { person: DuplicateMatch; batchId: string; originHref: string; onVisit: (id: string) => void }) {
  return <li className="min-w-0 rounded-lg border border-warning/30 bg-card p-3 text-xs text-foreground">
    <p className="break-words font-semibold text-foreground">{person.name}</p>
    <p className="mt-1 break-words">{[person.employeeCode || 'No employee code', person.designation, person.department, person.branch].filter(Boolean).join(' · ')}</p>
    <p className="mt-1 break-words text-muted-foreground">{person.kind === 'EMPLOYEE' ? 'Registered employee' : `Import: ${person.batchLabel || person.sourceFileName || (person.batchId === batchId ? 'This import' : 'Other import')}`}{person.kind !== 'EMPLOYEE' && person.rowNumber != null ? ` · Excel row ${person.rowNumber}` : ''}</p>
    <p className="mt-1 break-words">Personal mobile: {person.personalMobile || 'Not available'}</p>
    <p className="mt-1 text-warning">{person.reasons.includes('EMPLOYEE_CODE') ? 'Employee code conflicts. ' : ''}
      {person.reasons.includes('PERSONAL_MOBILE') ? 'Personal mobile conflicts. ' : ''}
      {person.reasons.includes('SAME_NAME') ? 'Same name.' : person.reasons.some(reason => ['NAME_FORMAT', 'PARTIAL_NAME', 'SIMILAR_NAME'].includes(reason)) ? 'Similar name—check spelling and details.' : ''}</p>
    {person.kind === 'EMPLOYEE' && person.employeeId
      ? <Link className="mt-2 inline-block font-medium text-primary underline" target="_blank" rel="noopener noreferrer"
          href={reviewEmployeeHref(person.employeeId, originHref)}>Open employee profile (new tab)</Link>
      : person.batchId === batchId && person.recordId
        ? <Button variant="ghost" type="button" className="mt-2 text-left font-medium text-primary underline h-auto whitespace-normal" onClick={() => onVisit(person.recordId!)}>View this import’s row {person.rowNumber ?? '—'}</Button>
        : person.batchId && <Link className="mt-2 inline-block break-words font-medium text-primary underline" target="_blank" rel="noopener noreferrer"
            href={person.recordId ? reviewRecordHref(person.batchId, person.recordId, originHref) : `/ems/onboarding/${encodeURIComponent(person.batchId)}`}>Open {person.batchLabel || person.sourceFileName || 'other import'} (new tab){person.rowNumber != null ? ` · Import row ${person.rowNumber}` : ''}</Link>}
  </li>;
}

export default function OnboardingDuplicateReview({ review, batchId, recordId, returnTo, dirty, disabled, onConfirm, onUndo, onVisit, onRefresh }: {
  review?: DuplicateReview | null;
  batchId: string;
  recordId: string;
  returnTo?: string | null;
  dirty: boolean;
  disabled: boolean;
  onConfirm: (token: string) => Promise<void>;
  onUndo: (token: string) => Promise<void>;
  onVisit: (id: string) => void;
  onRefresh: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setChecked(false); setError(null); }, [review?.token, dirty]);
  if (!review || (!review.hardConflicts.length && !review.possibleMatches.length)) return null;
  const hard = review.hardConflicts.length > 0;
  async function confirm() {
    if (!review?.token || !checked || dirty || disabled || pending || hard) return;
    setPending(true); setError(null);
    try { await onConfirm(review.token); }
    catch (error) { setChecked(false); setError(error instanceof Error ? error.message : 'Could not confirm. Review the matches and try again.'); }
    finally { setPending(false); }
  }
  async function undo() {
    if (!review?.token || !review.reviewed || dirty || disabled || pending) return;
    setPending(true); setError(null);
    try { await onUndo(review.token); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not undo the confirmation. Refresh and try again.'); }
    finally { setPending(false); }
  }
  const originHref = reviewRecordHref(batchId, recordId, returnTo);
  return <section data-editor-field="duplicateReview" tabIndex={-1} aria-label="Duplicate-person review"
    className="min-w-0 space-y-3 rounded-lg border border-warning/50 bg-warning-subtle p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <h3 className="text-sm font-semibold text-warning">{hard ? 'Identity conflict' : review.reviewed ? 'Different person confirmed' : 'Possible duplicate person'}</h3>
    <p className="text-xs text-warning">{hard ? 'Employee code or personal mobile conflicts with another record.' : review.reviewed ? 'Your different-person confirmation is saved.' : 'Check the matches before confirming this is a different person.'}</p>
    <details key={review.token}>
      <summary className="cursor-pointer text-xs font-semibold text-warning">Review {review.hardConflicts.length + review.possibleMatches.length} {review.hardConflicts.length + review.possibleMatches.length === 1 ? 'match' : 'matches'}</summary>
      <p className="mt-2 text-xs text-warning">{hard
        ? 'Correct the employee code or personal mobile, or exclude an accidentally repeated import row. A different-person confirmation cannot override these conflicts.'
        : review.reviewed ? 'Relevant identity changes require another review.' : 'Check every match. Similar names can belong to different people; nothing is merged automatically.'}</p>
      <ul className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        {[...review.hardConflicts, ...review.possibleMatches].map(person => <Match key={person.key} person={person} batchId={batchId} originHref={originHref} onVisit={onVisit} />)}
      </ul>
    {dirty && <p className="text-xs text-warning">Matches describe the saved record. Save &amp; re-validate your edits before confirming.</p>}
    {!hard && !review.reviewed && <>
      <label className="flex items-start gap-2 text-sm text-warning">
        <Checkbox checked={checked} disabled={dirty || disabled || pending} onCheckedChange={(checked) => setChecked(checked)} className="mt-1 shrink-0" />
        <span>I checked every match. This record is a different person.</span>
      </label>
      <Button variant="ghost" type="button" disabled={!checked || dirty || disabled || pending} onClick={confirm}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary disabled:opacity-50 h-auto whitespace-normal">{pending ? 'Confirming…' : 'Confirm different person'}</Button>
    </>}
    </details>
    {review.reviewed && !hard && <Button variant="ghost" type="button" onClick={undo} disabled={dirty || disabled || pending}
      className="text-sm font-medium text-primary underline disabled:opacity-50 h-auto whitespace-normal">{pending ? 'Undoing…' : 'Undo confirmation'}</Button>}
    {error && <div role="alert" className="text-xs text-danger"><p>{error}</p>
      <Button variant="ghost" type="button" onClick={onRefresh} disabled={pending || disabled} className="mt-1 underline h-auto whitespace-normal">Refresh matches</Button>
    </div>}
  </section>;
}
