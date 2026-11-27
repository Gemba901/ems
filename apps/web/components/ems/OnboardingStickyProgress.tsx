import type {RegistrationBatchTotals} from './registration-progress';
import type {BatchProgress} from './onboarding-batch-progress';

export default function OnboardingStickyProgress({progress, overall, dirty, updating}: {progress: BatchProgress; overall?: RegistrationBatchTotals; dirty: boolean; updating: boolean}) {
  const {counts, cancelled} = progress;
  const total = overall?.total ?? progress.total;
  const included = overall ? overall.total - overall.excluded : progress.included;
  const registered = overall?.registered ?? counts.registered;
  const segments: [number, string][] = overall ? [[registered, '#059669']] : [[counts.registered, '#059669'], [counts.ready, '#2563eb'],
    [counts.needsReview + counts.waiting, '#d97706'], [counts.needsFixing, '#dc2626'], [counts.unchecked, '#94a3b8']];
  let offset = 0;
  const summary = overall ? `${registered} of ${included} included records registered. ${overall.excluded} excluded. Whole-import saved counts; filters do not change them.` : `${counts.registered} of ${included} included records registered. ${counts.ready} ready, ${counts.needsFixing} need fixing, ${counts.needsReview} need duplicate review, ${counts.waiting} waiting on reporting chain, ${counts.unchecked} not validated. ${counts.excluded} excluded. Counts include all pages; filters do not change them.`;
  const state = updating ? 'Updating; showing saved counts. ' : dirty ? 'Unsaved edits are not counted yet. ' : cancelled ? 'Cancelled import; saved counts. ' : '';
  return <div data-sticky-progress title={state + summary} className="flex shrink-0 items-center gap-1.5 text-xs text-foreground">
    <svg viewBox="0 0 36 36" aria-hidden="true" className="h-4 w-4 shrink-0 -rotate-90 max-sm:hidden">
      <circle cx="18" cy="18" r="13" fill="none" stroke="#e2e8f0" strokeWidth="6" />
      {!!included && segments.map(([count, colour], index) => {
        const length = count / included * 100, start = offset; offset += length;
        return count ? <circle key={index} cx="18" cy="18" r="13" pathLength="100" fill="none"
          stroke={cancelled ? '#94a3b8' : colour} strokeWidth="6" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} /> : null;
      })}
    </svg>
    <span className="whitespace-nowrap text-[11px] font-semibold text-foreground">
      {cancelled && 'Cancelled · '}{included ? <>{registered}/{included}<span className="max-sm:hidden"> registered</span></> : total ? 'All excluded' : 'No records'}
    </span>
    <span className="sr-only">{state}{summary}</span>
  </div>;
}

/**
 * Phones: the top bar's bottom edge shows the import's progress, left to right:
 * green registered, blue ready, amber needs review or waiting, red needs fixing, grey not validated.
 */
export function OnboardingEdgeProgress({progress, overall}: {progress: BatchProgress; overall?: RegistrationBatchTotals}) {
  const {counts, cancelled} = progress;
  const included = overall ? overall.total - overall.excluded : progress.included;
  if (!included) return null;
  const segments: [number, string][] = overall ? [[overall.registered, 'bg-success']] : [[counts.registered, 'bg-success'], [counts.ready, 'bg-info'],
    [counts.needsReview + counts.waiting, 'bg-warning'], [counts.needsFixing, 'bg-danger'], [counts.unchecked, 'bg-muted-foreground']];
  return <div data-edge-progress aria-hidden="true" className="pointer-events-none absolute inset-x-2 bottom-1 flex h-1 overflow-hidden rounded-full bg-muted sm:hidden">
    {segments.map(([count, colour], index) => count
      ? <span key={index} className={cancelled ? 'bg-muted-foreground' : colour} style={{width: `${count / included * 100}%`}} />
      : null)}
  </div>;
}
