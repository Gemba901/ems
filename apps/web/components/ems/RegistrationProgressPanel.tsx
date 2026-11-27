'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pause, PauseCircle, Play, X } from 'lucide-react';
import { registrationActive, registrationProgressText, type RegistrationBatchTotals, type RegistrationProgress } from './registration-progress';

export default function RegistrationProgressPanel({ run, overall, disconnected, checking, error, onRefresh, onStop, stopping,
  onResume, resumeDisabled, resumeBlockedReason, starting }: {
  run?: RegistrationProgress | null; overall: RegistrationBatchTotals; disconnected: boolean; checking: boolean; error?: string;
  onRefresh: () => void; onStop: () => void; stopping: boolean;
  onResume: () => void; resumeDisabled: boolean; resumeBlockedReason: string; starting: boolean;
}) {
  const active = registrationActive(run);
  const [details, setDetails] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const noticeKey = run ? `${run.id}:${run.status}` : disconnected ? 'connection' : error ?? '';
  useEffect(() => { setDetails(false); }, [run?.id]);
  useEffect(() => {
    if (run?.status !== 'COMPLETED' || disconnected || error) return;
    const timer = setTimeout(() => setDismissed(noticeKey), 10000);
    return () => clearTimeout(timer);
  }, [run?.status, noticeKey, disconnected, error]);
  if (!run && !disconnected && !error) return null;
  if (!active && dismissed === noticeKey) return null;

  const attention = disconnected || !!error || run?.status === 'FAILED';
  const paused = run?.status === 'STOPPED';
  const complete = run?.status === 'COMPLETED';
  const title = active ? disconnected ? 'Reconnecting…' : 'Registering'
    : complete ? 'Registration finished' : paused ? 'Registration paused'
    : run?.status === 'FAILED' ? 'Registration needs attention' : 'Status unavailable';
  const tone = attention || paused
    ? { border: 'border-amber-600', heading: 'bg-amber-800', track: 'bg-amber-100', fill: 'bg-amber-600' }
    : complete
      ? { border: 'border-emerald-600', heading: 'bg-emerald-800', track: 'bg-emerald-100', fill: 'bg-emerald-600' }
      : { border: 'border-indigo-600', heading: 'bg-indigo-700', track: 'bg-indigo-100', fill: 'bg-indigo-600' };
  const Icon = attention ? AlertTriangle : paused ? PauseCircle : complete ? CheckCircle2 : Loader2;
  const included = overall.total - overall.excluded;
  const progressValue = Math.max(0, Math.min(overall.registered, included));
  const controlClass = 'inline-flex shrink-0 items-center gap-1 rounded px-2 py-1.5 font-semibold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50';

  return <section aria-label="Registration progress"
    className={`fixed bottom-3 left-3 right-3 z-40 max-h-[60vh] overflow-y-auto rounded-xl border-2 bg-white text-xs text-slate-900 shadow-xl sm:left-auto sm:right-4 sm:w-96 ${tone.border}`}>
    <div className={`flex items-center justify-between gap-2 px-3 py-1 text-white ${tone.heading}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active && !attention ? 'motion-safe:animate-spin' : ''}`} />
        <p role="status" className="font-semibold">{title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {active && <button type="button" aria-label="Pause registration" onClick={onStop} disabled={stopping || disconnected}
          className={controlClass}><Pause aria-hidden="true" className="h-3.5 w-3.5" />{stopping ? 'Pausing…' : 'Pause'}</button>}
        {paused && <button type="button" aria-label="Resume registration" onClick={onResume} disabled={resumeDisabled || starting}
          title={resumeDisabled ? resumeBlockedReason : 'Continue with remaining eligible ready records'} className={controlClass}>
          <Play aria-hidden="true" className="h-3.5 w-3.5" />{starting ? 'Resuming…' : 'Resume'}</button>}
        {!active && <button type="button" aria-label="Dismiss registration message" onClick={() => setDismissed(noticeKey)} className={controlClass}>
          <X aria-hidden="true" className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
    <div className="px-3 py-2">
      {run && <>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold tabular-nums">{overall.registered} / {included} registered <span className="font-normal text-slate-500">overall</span></p>
          <button type="button" aria-expanded={details} onClick={() => setDetails(value => !value)} className="shrink-0 py-1 text-slate-600 underline underline-offset-2">{details ? 'Less detail' : 'Details'}</button>
        </div>
        {included > 0 && <div role="progressbar" aria-label="Included import records registered" aria-valuemin={0}
          aria-valuemax={included} aria-valuenow={progressValue} className={`mt-1 h-1.5 overflow-hidden rounded-full ${tone.track}`}>
          <div className={`h-full rounded-full motion-safe:transition-[width] ${tone.fill}`} style={{ width: `${progressValue / included * 100}%` }} />
        </div>}
      </>}
      {(disconnected || error || run?.status === 'FAILED' || details) && <p className="mt-2 leading-relaxed">
        {error || (run ? registrationProgressText(run, disconnected) : 'Cannot check saved status yet. You can review rows and leave this page. Register all stays unavailable until status is confirmed.')}
      </p>}
      {paused && resumeDisabled && !starting && !disconnected && <p className="mt-2 text-amber-900">{resumeBlockedReason}</p>}
      {(disconnected || checking) && <button type="button" onClick={onRefresh} className="mt-1 py-1 font-semibold underline underline-offset-2">Check again</button>}
      {!details && run && (run.failed > 0 || run.awaitingAdmin > 0 || run.skipped > 0) && <p className="mt-2 text-amber-900">Some records need attention. Open Details.</p>}
      {details && run && <div className="mt-2 space-y-1 text-slate-600">
        <p>{overall.total} import records · {overall.excluded} excluded. Filters do not change the overall count.</p>
        <p>This run: {run.processed} / {run.total} checked · {run.registered} registered · {run.failed} need review · {run.awaitingAdmin} require an Admin · {run.skipped} skipped.</p>
        <p className="break-all text-slate-500">Run reference: {run.id}</p>
      </div>}
    </div>
  </section>;
}
