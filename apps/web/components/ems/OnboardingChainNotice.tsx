"use client";
import Link from 'next/link';
import type {OnboardingRecord, ReportingResolution} from '@/services/ems.service';
import {chainRegistrationNotice} from './onboarding-editor-controls';
import {reviewEmployeeHref, reviewRecordHref} from './onboarding-review-navigation';
import { Button } from "@/components/ui/button";

export default function OnboardingChainNotice({record, resolution, batchId, returnTo, disabled, location, onVisit}: {
  record: OnboardingRecord; resolution?: ReportingResolution; batchId: string; returnTo?: string | null;
  disabled: boolean; location?: string; onVisit: (id: string) => void;
}) {
  const notice = chainRegistrationNotice(record, resolution);
  if (!notice) return null;
  if (notice.kind === 'pending') return <div data-chain-notice className="mt-2 max-w-xs space-y-1 text-xs text-warning">
    <p className="font-medium">Valid manager assignment pending</p>
    <p>{resolution?.managerName || 'The selected manager'} has not registered. {record.status === 'READY'
      ? 'This record can register now; the manager link will complete automatically.'
      : 'Resolve this record’s other findings; the pending manager does not block registration.'}</p>
  </div>;
  const blocker = resolution?.blocker;
  const origin = reviewRecordHref(batchId, record.id, returnTo);
  const href = blocker?.employeeId ? reviewEmployeeHref(blocker.employeeId, origin) + '#reporting-manager'
    : blocker?.recordId && blocker.batchId && blocker.batchId !== batchId ? reviewRecordHref(blocker.batchId, blocker.recordId, origin) : null;
  const local = blocker?.recordId && (!blocker.batchId || blocker.batchId === batchId) ? blocker.recordId : null;
  return <div data-chain-notice className="mt-2 max-w-sm space-y-1 rounded-lg border border-warning/30 bg-warning-subtle px-2.5 py-2 text-xs text-warning" onClick={event => event.stopPropagation()}>
    <p className="font-semibold">{notice.heading}</p>
    <p>{notice.message}</p>
    <p>{notice.next}</p>
    {local
      ? <Button variant="ghost" type="button" disabled={disabled} onClick={() => onVisit(local)} className="inline-block min-h-8 text-left font-semibold text-primary underline disabled:opacity-40 whitespace-normal">
          View blocking record{location ? ` · ${location}` : ''}</Button>
      : href ? <Link href={href} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || undefined}
          onClick={event => {if (disabled) event.preventDefault();}}
          className={`inline-block min-h-8 pt-1 font-semibold text-primary underline ${disabled ? 'opacity-40' : ''}`}>
          {blocker?.employeeId ? 'View blocking employee' : 'View blocking record'} (new tab)</Link>
        : <p className="text-warning">The blocking person’s location is unavailable. Refresh or validate to update the chain details.</p>}
    {href && <p className="text-warning">Your review stays here; the opened page also has Return to review.</p>}
  </div>;
}
