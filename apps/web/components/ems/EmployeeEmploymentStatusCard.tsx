"use client";
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmsService, EMPLOYMENT_STATUS_LABELS as labels, type EmploymentStatus, type EmploymentStatusDetail, type ChangeEmploymentStatusPayload } from '@/services/ems.service';
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const active = (status: EmploymentStatus) => status === 'ACTIVE' || status === 'PROBATION';
const group = (status: EmploymentStatus) => active(status) ? 'Active' : 'Inactive';
const input = 'w-full rounded-lg border border-border bg-card p-2 text-sm disabled:bg-muted';
const button = 'rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50';

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
  return <section id="employment-status" aria-labelledby="employment-status-title" className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="employment-status-title" className="font-bold text-foreground">Employment status</h2>
        {data && <p className="mt-1 text-sm"><span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${active(data.status) ? 'bg-success-subtle text-success' : 'bg-muted text-foreground'}`}>{group(data.status)}</span> <span className="text-foreground">{labels[data.status]}</span></p>}
      </div>
      {!snapshot && <Button variant="ghost" ref={changeButton} type="button" className={`${button} h-auto whitespace-normal`} disabled={busy || query.isLoading || !data} onClick={() => void open()}>Change status</Button>}
    </div>
    {query.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading employment status…</p>}
    {query.error && <div role="alert" className="text-sm text-danger">Could not load employment status. <Button variant="ghost" type="button" className="underline h-auto whitespace-normal" onClick={() => void query.refetch()}>Retry loading</Button></div>}
    {message && <p role="status" className="text-sm font-semibold text-success">{message}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {data?.syncChangeId && <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
      <p>Employment status is saved. Activity synchronization is {data.activitySync === 'PENDING' ? 'pending' : data.activitySync === 'UNAVAILABLE' ? 'unavailable' : 'incomplete'}.</p>
      <Button variant="ghost" type="button" disabled={busy} className="mt-2 font-semibold underline h-auto whitespace-normal" onClick={() => void retrySync()}>Retry activity synchronization</Button>
    </div>}
    {snapshot && <div className="border-t border-border pt-3 space-y-3">
      {!confirmation ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-foreground">New status
            <NativeSelect autoFocus className={`${input} mt-1 font-normal`} disabled={busy} value={target} onChange={e => setTarget(e.target.value as EmploymentStatus)}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{group(value as EmploymentStatus)} · {label}</option>)}
            </NativeSelect>
          </label>
          <label className="text-sm font-semibold text-foreground">Reason <span className="font-normal text-muted-foreground">(required)</span>
            <Textarea ref={reasonInput} className={`${input} mt-1 font-normal`} maxLength={500} rows={2} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this employment status changing?" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Probation counts as active. Ordinary leave is handled as availability, separately from employment status.</p>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" type="button" disabled={busy} className={`h-auto whitespace-normal ${button} border-primary bg-primary text-primary-foreground`} onClick={review}>Review change</Button><Button variant="ghost" type="button" disabled={busy} className={`${button} h-auto whitespace-normal`} onClick={cancel}>Cancel</Button></div>
      </> : <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 space-y-3 text-sm">
        <p className="font-semibold">Confirm for {employeeName}: {labels[snapshot.status]} → {labels[confirmation.status]}</p>
        <p className="break-words">Reason: {confirmation.reason}</p>
        <p>Takes effect now. This person will count as {group(confirmation.status).toLowerCase()} in this organisation. Their profile and reporting links remain available. This does not change their sign-in access or send an invitation.</p>
        {uncertain && <p className="font-medium text-warning">Confirmation has not been verified here. Retry the same confirmation, or reload the saved status before making another change.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" autoFocus type="button" disabled={busy} className={`h-auto whitespace-normal ${button} border-primary bg-primary text-primary-foreground`} onClick={() => void save()}>{busy ? 'Saving…' : uncertain ? 'Retry confirmation' : 'Confirm change'}</Button>
          {uncertain ? <Button variant="ghost" type="button" disabled={busy} className={`${button} h-auto whitespace-normal`} onClick={() => void open(true)}>Reload status to review</Button> : <><Button variant="ghost" type="button" disabled={busy} className={`${button} h-auto whitespace-normal`} onClick={() => setConfirmation(null)}>Back to edit</Button><Button variant="ghost" type="button" disabled={busy} className={`${button} h-auto whitespace-normal`} onClick={cancel}>Cancel</Button></>}
        </div>
      </div>}
    </div>}
    {data && <details className="border-t border-border pt-2 text-sm">
      <summary className="cursor-pointer font-semibold text-foreground">Status change history{data.history.length ? ` (${data.hasMoreHistory ? 'latest ' : ''}${data.history.length})` : ''}</summary>
      <p className="my-2 text-xs text-muted-foreground">Confirmed changes made here. The imported status is the starting value; earlier changes and updates through other modules are not reconstructed.</p>
      {!data.history.length ? <p className="text-muted-foreground">No confirmed EMS status changes yet.</p> : <ol className="divide-y divide-border">{data.history.map(change => <li key={change.id} className="py-3 space-y-1">
        <p className="font-semibold">{labels[change.fromStatus]} → {labels[change.toStatus]}</p>
        <p className="break-words">{change.reason}</p>
        <p className="text-xs text-muted-foreground">{change.actorName || 'Authorised HR/Admin'} · {new Date(change.changedAt).toLocaleString()} · Manual change</p>
      </li>)}</ol>}
    </details>}
  </section>;
}
