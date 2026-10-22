import type {BatchProgress} from './onboarding-batch-progress';

export default function OnboardingStickyProgress({progress, dirty, updating}: {progress: BatchProgress; dirty: boolean; updating: boolean}) {
  const {counts, included, cancelled, total} = progress;
  const segments: [number, string][] = [[counts.registered, '#059669'], [counts.ready, '#2563eb'],
    [counts.needsReview + counts.waiting, '#d97706'], [counts.needsFixing, '#dc2626'], [counts.unchecked, '#94a3b8']];
  let offset = 0;
  const summary = `${counts.registered} of ${included} included records registered. ${counts.ready} ready, ${counts.needsFixing} need fixing, ${counts.needsReview} need duplicate review, ${counts.waiting} waiting on reporting chain, ${counts.unchecked} not validated. ${counts.excluded} excluded. Counts include all pages; filters do not change them.`;
  const state = updating ? 'Updating; showing saved counts. ' : dirty ? 'Unsaved edits are not counted yet. ' : cancelled ? 'Cancelled import; saved counts. ' : '';
  return <div data-sticky-progress title={state + summary} className="flex shrink-0 items-center gap-1.5 text-xs text-slate-700">
    <svg viewBox="0 0 36 36" aria-hidden="true" className="h-4 w-4 shrink-0 -rotate-90">
      <circle cx="18" cy="18" r="13" fill="none" stroke="#e2e8f0" strokeWidth="6" />
      {!!included && segments.map(([count, colour], index) => {
        const length = count / included * 100, start = offset; offset += length;
        return count ? <circle key={index} cx="18" cy="18" r="13" pathLength="100" fill="none"
          stroke={cancelled ? '#94a3b8' : colour} strokeWidth="6" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} /> : null;
      })}
    </svg>
    <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">
      {cancelled && 'Cancelled · '}{included ? `${counts.registered}/${included} registered` : total ? 'All excluded' : 'No records'}
    </span>
    <span className="sr-only">{state}{summary}</span>
  </div>;
}
