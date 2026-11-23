import type { RegistrationBatchTotals } from './registration-progress';
import type { BatchProgress } from './onboarding-batch-progress';

function Meter({label, percent, muted = false}: {label: string; percent: number | null; muted?: boolean}) {
  if (percent === null) return null;
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
    <div className={`h-full rounded-full ${muted ? 'bg-slate-400' : 'bg-emerald-600'}`} style={{width:`${percent}%`}} />
  </div>;
}

export default function OnboardingBatchProgress({progress, overall, dirty, updating}: {
  progress: BatchProgress; overall?: RegistrationBatchTotals; dirty: boolean; updating: boolean;
}) {
  const {counts, remaining, readyPercent, cancelled} = progress;
  const total = overall?.total ?? progress.total;
  const included = overall ? overall.total - overall.excluded : progress.included;
  const registered = overall?.registered ?? counts.registered;
  const registeredPercent = included ? registered === included ? 100 : Math.min(99.9, Math.round(registered / included * 1000) / 10) : null;
  const outstanding = [
    counts.needsFixing ? `${counts.needsFixing} need fixing` : '',
    counts.needsReview ? `${counts.needsReview} need duplicate review` : '',
    counts.waiting ? `${counts.waiting} waiting on reporting chain` : '',
    counts.unchecked ? `${counts.unchecked} not validated` : '',
  ].filter(Boolean);
  return <section aria-label="Batch progress" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="font-semibold text-slate-900">{overall ? cancelled ? 'Cancelled' : registered === included && included > 0 ? 'Registered' : 'Import progress' : progress.label}</p>
      <p className="text-slate-500">Whole import · {total} total · {overall?.excluded ?? counts.excluded} excluded</p>
    </div>
    {included > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-6">
      <div>
        <p className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-slate-700"><span className="font-medium">Registered</span><span>{registered} of {included} included · {registeredPercent}%</span></p>
        <Meter label="Registered percentage of included records" percent={registeredPercent} muted={cancelled} />
      </div>
      <div>
        <p className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-slate-700"><span className="font-medium">{overall || cancelled ? 'Ready at last full refresh' : 'Ready to register'}</span>
          <span>{remaining ? `${counts.ready} of ${remaining} remaining · ${readyPercent}%` : 'Nothing left to register'}</span></p>
        <Meter label={cancelled ? 'Ready percentage at last check' : 'Ready percentage of remaining records'} percent={readyPercent} muted={cancelled} />
      </div>
    </div> : <p className="mt-2 text-slate-600">{total ? 'No included records to register.' : 'No records have been uploaded.'}</p>}
    {outstanding.length > 0 && <p className={`mt-2 ${cancelled ? 'text-slate-500' : 'text-amber-800'}`}>{overall && 'At last full refresh: '}{outstanding.join(' · ')}</p>}
    {cancelled && <p className="mt-2 text-slate-600">Saved counts for reference. Registration is unavailable for this cancelled import.</p>}
    {updating ? <p role="status" className="mt-2 text-slate-500">{overall ? 'Updating… registered total uses saved progress; the review breakdown refreshes when registration pauses or finishes.' : 'Updating… showing the last saved counts.'}</p>
      : dirty && <p className="mt-2 text-slate-500">Unsaved edits are not counted yet.</p>}
  </section>;
}
