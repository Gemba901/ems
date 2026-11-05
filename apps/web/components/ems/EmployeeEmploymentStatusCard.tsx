"use client";
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmsService, EMPLOYMENT_STATUS_LABELS as labels, type EmploymentStatus, type EmploymentStatusDetail, type ChangeEmploymentStatusPayload } from '@/services/ems.service';

const active = (status: EmploymentStatus) => status === 'ACTIVE' || status === 'PROBATION';
const group = (status: EmploymentStatus) => active(status) ? 'Active' : 'Inactive';
const input = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-50';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50';

export default function EmployeeEmploymentStatusCard({ employeeId, employeeName, token }: { employeeId: string; employeeName: string; token: string }) {
  const client = useQueryClient();
  const key = ['ems-employment-status', employeeId];
  const query = useQuery({ queryKey: key, queryFn: () => EmsService.getEmploymentStatus(employeeId, token) });
  const [snapshot, setSnapshot] = useState<EmploymentStatusDetail | null>(null);
  const [target, setTarget] = useState<EmploymentStatus>('ACTIVE');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<ChangeEmploymentStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (snapshot) wasEditing.current = true;
    else if (!busy && wasEditing.current) { changeButton.current?.focus(); wasEditing.current = false; }
  }, [snapshot, busy]);
  const errorText = (error: unknown) => error instanceof Error ? error.message : 'Could not complete the request. Please try again.';

  function accept(data: EmploymentStatusDetail) {
    client.setQueryData(key, data);
    for (const key of [['ems-employee', employeeId], ['employee', employeeId], ['ems-employees'], ['ems-employees-list'], ['ems-dashboard'], ['ems-people-links']]) void client.invalidateQueries({ queryKey: key });
  }
  async function open(keepReason = false) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const data = await EmsService.getEmploymentStatus(employeeId, token);
      client.setQueryData(key, data); setSnapshot(data);
      if (!keepReason) { setTarget(data.status); setReason(''); }
      setConfirmation(null); setUncertain(false);
    } catch (e) { setError(errorText(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function cancel() {
    setSnapshot(null); setConfirmation(null); setError(''); setUncertain(false);
    changeButton.current?.focus();
  }
  function review() {
    if (!snapshot) return;
    if (target === snapshot.status) { setError('Choose a different status.'); return; }
    if (reason.trim().length < 3 || reason.trim().length > 500) { setError('Give a reason of 3–500 characters.'); reasonInput.current?.focus(); return; }
    setError('');
    setConfirmation({ status: target, reason: reason.trim(), expectedRevision: snapshot.revision, expectedUpdatedAt: snapshot.updatedAt, requestId: crypto.randomUUID() });
  }
  async function save() {
    if (!confirmation || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const data = await EmsService.changeEmploymentStatus(employeeId, confirmation, token);
      accept(data); setSnapshot(null); setConfirmation(null); setUncertain(false);
      setMessage(`Saved · ${group(data.status)} · ${labels[data.status]}`);
      changeButton.current?.focus();
    } catch (e) { setError(errorText(e)); setUncertain(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function retrySync() {
    if (!query.data?.syncChangeId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const data = await EmsService.retryEmploymentActivitySync(employeeId, query.data.syncChangeId, token);
      accept(data);
      setMessage(data.syncChangeId ? 'Status is saved. Activity synchronization still needs attention.' : 'Activity synchronization completed.');
    } catch (e) { setError(errorText(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const data = query.data;
  return <section id="employment-status" aria-labelledby="employment-status-title" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="employment-status-title" className="font-bold text-slate-900">Employment status</h2>
        {data && <p className="mt-1 text-sm"><span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${active(data.status) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{group(data.status)}</span> <span className="text-slate-700">{labels[data.status]}</span></p>}
      </div>
      {!snapshot && <button ref={changeButton} type="button" className={button} disabled={busy || query.isLoading || !data} onClick={() => void open()}>Change status</button>}
    </div>
    {query.isLoading && <p role="status" className="text-sm text-slate-500">Loading employment status…</p>}
    {query.error && <div role="alert" className="text-sm text-red-700">Could not load employment status. <button type="button" className="underline" onClick={() => void query.refetch()}>Retry loading</button></div>}
    {message && <p role="status" className="text-sm font-semibold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {data?.syncChangeId && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p>Employment status is saved. Activity synchronization is {data.activitySync === 'PENDING' ? 'pending' : data.activitySync === 'UNAVAILABLE' ? 'unavailable' : 'incomplete'}.</p>
      <button type="button" disabled={busy} className="mt-2 font-semibold underline" onClick={() => void retrySync()}>Retry activity synchronization</button>
    </div>}
    {snapshot && <div className="border-t border-slate-100 pt-3 space-y-3">
      {!confirmation ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-800">New status
            <select autoFocus className={`${input} mt-1 font-normal`} disabled={busy} value={target} onChange={e => setTarget(e.target.value as EmploymentStatus)}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{group(value as EmploymentStatus)} · {label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-800">Reason <span className="font-normal text-slate-500">(required)</span>
            <textarea ref={reasonInput} className={`${input} mt-1 font-normal`} maxLength={500} rows={2} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this employment status changing?" />
          </label>
        </div>
        <p className="text-xs text-slate-500">Probation counts as active. Ordinary leave is handled as availability, separately from employment status.</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={`${button} border-violet-700 bg-violet-700 text-white`} onClick={review}>Review change</button><button type="button" disabled={busy} className={button} onClick={cancel}>Cancel</button></div>
      </> : <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-3 text-sm">
        <p className="font-semibold">Confirm for {employeeName}: {labels[snapshot.status]} → {labels[confirmation.status]}</p>
        <p className="break-words">Reason: {confirmation.reason}</p>
        <p>Takes effect now. This person will count as {group(confirmation.status).toLowerCase()} in this organisation. Their profile and reporting links remain available. This does not change their sign-in access or send an invitation.</p>
        {uncertain && <p className="font-medium text-amber-900">Confirmation has not been verified here. Retry the same confirmation, or reload the saved status before making another change.</p>}
        <div className="flex flex-wrap gap-2">
          <button autoFocus type="button" disabled={busy} className={`${button} border-violet-700 bg-violet-700 text-white`} onClick={() => void save()}>{busy ? 'Saving…' : uncertain ? 'Retry confirmation' : 'Confirm change'}</button>
          {uncertain ? <button type="button" disabled={busy} className={button} onClick={() => void open(true)}>Reload status to review</button> : <><button type="button" disabled={busy} className={button} onClick={() => setConfirmation(null)}>Back to edit</button><button type="button" disabled={busy} className={button} onClick={cancel}>Cancel</button></>}
        </div>
      </div>}
    </div>}
    {data && <details className="border-t border-slate-100 pt-2 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-700">Status change history{data.history.length ? ` (${data.hasMoreHistory ? 'latest ' : ''}${data.history.length})` : ''}</summary>
      <p className="my-2 text-xs text-slate-500">Confirmed changes made here. The imported status is the starting value; earlier changes and updates through other modules are not reconstructed.</p>
      {!data.history.length ? <p className="text-slate-500">No confirmed EMS status changes yet.</p> : <ol className="divide-y divide-slate-100">{data.history.map(change => <li key={change.id} className="py-3 space-y-1">
        <p className="font-semibold">{labels[change.fromStatus]} → {labels[change.toStatus]}</p>
        <p className="break-words">{change.reason}</p>
        <p className="text-xs text-slate-500">{change.actorName || 'Authorised HR/Admin'} · {new Date(change.changedAt).toLocaleString()} · Manual change</p>
      </li>)}</ol>}
    </details>}
  </section>;
}
