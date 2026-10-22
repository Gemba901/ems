"use client";

import Link from "next/link";
import { reviewEmployeeHref, reviewRecordHref } from "./onboarding-review-navigation";
import { useEffect, useState } from "react";
import type { DuplicateMatch, DuplicateReview } from "@/services/ems.service";

function Match({ person, batchId, originHref, onVisit }: { person: DuplicateMatch; batchId: string; originHref: string; onVisit: (id: string) => void }) {
  return <li className="min-w-0 rounded-lg border border-amber-200 bg-white p-3 text-xs text-slate-700">
    <p className="break-words font-semibold text-slate-900">{person.name}</p>
    <p className="mt-1 break-words">{[person.employeeCode || 'No employee code', person.designation, person.department, person.branch].filter(Boolean).join(' · ')}</p>
    <p className="mt-1 break-words text-slate-500">{person.kind === 'EMPLOYEE' ? 'Registered employee' : `Import: ${person.batchLabel || person.sourceFileName || (person.batchId === batchId ? 'This import' : 'Other import')}`}{person.kind !== 'EMPLOYEE' && person.rowNumber != null ? ` · Excel row ${person.rowNumber}` : ''}</p>
    <p className="mt-1 break-words">Personal mobile: {person.personalMobile || 'Not available'}</p>
    <p className="mt-1 text-amber-900">{person.reasons.includes('EMPLOYEE_CODE') ? 'Employee code conflicts. ' : ''}
      {person.reasons.includes('PERSONAL_MOBILE') ? 'Personal mobile conflicts. ' : ''}
      {person.reasons.includes('SAME_NAME') ? 'Same name.' : person.reasons.some(reason => ['NAME_FORMAT', 'PARTIAL_NAME', 'SIMILAR_NAME'].includes(reason)) ? 'Similar name—check spelling and details.' : ''}</p>
    {person.kind === 'EMPLOYEE' && person.employeeId
      ? <Link className="mt-2 inline-block font-medium text-purple-800 underline" target="_blank" rel="noopener noreferrer"
          href={reviewEmployeeHref(person.employeeId, originHref)}>Open employee profile (new tab)</Link>
      : person.batchId === batchId && person.recordId
        ? <button type="button" className="mt-2 text-left font-medium text-purple-800 underline" onClick={() => onVisit(person.recordId!)}>View this import’s row {person.rowNumber ?? '—'}</button>
        : person.batchId && <Link className="mt-2 inline-block break-words font-medium text-purple-800 underline" target="_blank" rel="noopener noreferrer"
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
    className="min-w-0 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-600">
    <h3 className="text-sm font-semibold text-amber-950">{hard ? 'Identity conflict' : review.reviewed ? 'Different person confirmed' : 'Possible duplicate person'}</h3>
    <p className="text-xs text-amber-950">{hard ? 'Employee code or personal mobile conflicts with another record.' : review.reviewed ? 'Your different-person confirmation is saved.' : 'Check the matches before confirming this is a different person.'}</p>
    <details key={review.token}>
      <summary className="cursor-pointer text-xs font-semibold text-amber-950">Review {review.hardConflicts.length + review.possibleMatches.length} {review.hardConflicts.length + review.possibleMatches.length === 1 ? 'match' : 'matches'}</summary>
      <p className="mt-2 text-xs text-amber-950">{hard
        ? 'Correct the employee code or personal mobile, or exclude an accidentally repeated import row. A different-person confirmation cannot override these conflicts.'
        : review.reviewed ? 'Relevant identity changes require another review.' : 'Check every match. Similar names can belong to different people; nothing is merged automatically.'}</p>
      <ul className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        {[...review.hardConflicts, ...review.possibleMatches].map(person => <Match key={person.key} person={person} batchId={batchId} originHref={originHref} onVisit={onVisit} />)}
      </ul>
    {dirty && <p className="text-xs text-amber-950">Matches describe the saved record. Save &amp; re-validate your edits before confirming.</p>}
    {!hard && !review.reviewed && <>
      <label className="flex items-start gap-2 text-sm text-amber-950">
        <input type="checkbox" checked={checked} disabled={dirty || disabled || pending} onChange={event => setChecked(event.target.checked)} className="mt-1 shrink-0" />
        <span>I checked every match. This record is a different person.</span>
      </label>
      <button type="button" disabled={!checked || dirty || disabled || pending} onClick={confirm}
        className="rounded-lg bg-purple-800 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-900 disabled:opacity-50">{pending ? 'Confirming…' : 'Confirm different person'}</button>
    </>}
    </details>
    {review.reviewed && !hard && <button type="button" onClick={undo} disabled={dirty || disabled || pending}
      className="text-sm font-medium text-purple-800 underline disabled:opacity-50">{pending ? 'Undoing…' : 'Undo confirmation'}</button>}
    {error && <div role="alert" className="text-xs text-red-800"><p>{error}</p>
      <button type="button" onClick={onRefresh} disabled={pending || disabled} className="mt-1 underline">Refresh matches</button>
    </div>}
  </section>;
}
