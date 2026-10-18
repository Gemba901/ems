"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmsService, type EmployeePeopleLinks } from '@/services/ems.service';
import { PersonLinkPicker, PersonLinkStatus } from './OnboardingPeopleLinks';

export default function EmployeePeopleLinksCard({employeeId, token}: {employeeId: string; token: string}) {
  const client = useQueryClient(), queryKey = ['ems-people-links', employeeId];
  const {data, isLoading, error, refetch} = useQuery({queryKey, queryFn: () => EmsService.getEmployeePeopleLinks(employeeId, token)});
  const [editing, setEditing] = useState<'hod' | 'relievers' | null>(null);
  const [first, setFirst] = useState('NONE'), [second, setSecond] = useState('NONE'), [hod, setHod] = useState('NONE');
  const [version, setVersion] = useState(''), [feedback, setFeedback] = useState<string | null>(null);
  function saved(updated: EmployeePeopleLinks, message: string) {
    client.setQueryData(queryKey, updated); setEditing(null); setFeedback(message);
    client.invalidateQueries({queryKey: ['ems-onboarding-batch']});
    client.invalidateQueries({queryKey: ['ems-onboarding-batches']});
    client.invalidateQueries({queryKey: ['ems-people-links']});
  }
  const saveRelievers = useMutation({mutationFn: () => EmsService.updateEmployeeRelievers(employeeId, {first, second, expectedVersion: version}, token),
    onSuccess: updated => saved(updated, 'Relievers saved.')});
  const saveHod = useMutation({mutationFn: () => EmsService.updateEmployeeDepartmentHod(employeeId, {target: hod, expectedVersion: version}, token),
    onSuccess: updated => saved(updated, 'Department HOD saved.')});
  const busy = saveRelievers.isPending || saveHod.isPending;
  function begin(kind: 'hod' | 'relievers') {
    if (!data) return;
    setFeedback(null); saveRelievers.reset(); saveHod.reset(); setEditing(kind);
    setFirst(data.first.target ?? 'NONE'); setSecond(data.second.target ?? 'NONE'); setHod(data.hod.target ?? 'NONE');
    setVersion(kind === 'hod' ? data.hodVersion : data.version);
  }
  return <section id="hod-and-relievers" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
    <h2 className="font-semibold text-slate-900">HOD and relievers</h2>
    {isLoading && <p className="text-sm text-slate-500">Loading people links…</p>}
    {error && <div role="alert" className="text-sm text-red-700">Could not load the people links. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></div>}
    {feedback && <p role="status" className="text-sm text-green-800">{feedback}</p>}
    {data && <>
      <div className="space-y-2 border-b border-slate-100 pb-4">
        <h3 className="text-sm font-semibold">Department HOD</h3>
        <p className="text-xs text-slate-500">{data.departmentName || 'No department'} · {data.branchLabel}</p>
        <PersonLinkStatus link={data.hod} />
        {data.previousHod && <p className="text-xs text-amber-800">Previously recorded: {[data.previousHod.name, data.previousHod.designation].filter(Boolean).join(' · ')}. Choose the department HOD to confirm this as a linked person.</p>}
        {editing === 'hod' ? <div className="space-y-3">
          <PersonLinkPicker id={`profile-hod-${employeeId}`} label="HOD person" value={hod} options={data.hodOptions} disabled={busy} onChange={setHod} />
          <p className="text-xs text-amber-800">This changes the HOD for everyone in this department and branch. It does not grant an access role.</p>
          {saveHod.error && <p role="alert" className="text-sm text-red-700">{saveHod.error.message}</p>}
          <button type="button" disabled={busy || !hod} onClick={() => saveHod.mutate()} className="rounded-lg bg-purple-800 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save department HOD'}</button>
        </div> : <button type="button" disabled={!!editing || !data.departmentId} onClick={() => begin('hod')} className="text-sm font-medium text-purple-800 underline disabled:opacity-50">Change department HOD</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><h3 className="text-sm font-semibold">First reliever</h3><PersonLinkStatus link={data.first} /></div>
        <div className="space-y-2"><h3 className="text-sm font-semibold">Second reliever</h3><PersonLinkStatus link={data.second} /></div>
      </div>
      {editing === 'relievers' ? <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonLinkPicker id={`profile-first-${employeeId}`} label="First reliever" value={first} options={data.options} disabled={busy} onChange={setFirst} />
          <PersonLinkPicker id={`profile-second-${employeeId}`} label="Second reliever" value={second} options={data.options} disabled={busy} onChange={setSecond}
            error={first !== 'NONE' && first === second ? 'Choose different people for first and second reliever.' : null} />
        </div>
        <p className="text-xs text-slate-500">Keep a pending choice or replace it with a registered employee. Replacing it prevents the old pending link from being applied later.</p>
        {saveRelievers.error && <p role="alert" className="text-sm text-red-700">{saveRelievers.error.message}</p>}
        <button type="button" disabled={busy || !first || !second || (first !== 'NONE' && first === second)} onClick={() => saveRelievers.mutate()}
          className="rounded-lg bg-purple-800 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save relievers'}</button>
      </div> : <button type="button" disabled={!!editing} onClick={() => begin('relievers')} className="text-sm font-medium text-purple-800 underline disabled:opacity-50">Change relievers</button>}
      {editing && <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancel changes</button>}
    </>}
  </section>;
}
