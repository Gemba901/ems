"use client";
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmsService, type EmployeePeopleLinks } from '@/services/ems.service';
import { PersonLinkPicker, PersonLinkStatus, PersonSummary } from './OnboardingPeopleLinks';
import { HodChooser, HodAppointmentReview, hodBranchNeedsConfirmation } from './OnboardingHodChooser';
import { Button } from "@/components/ui/button";

export default function EmployeePeopleLinksCard({employeeId, token}: {employeeId: string; token: string}) {
  const client = useQueryClient(), queryKey = ['ems-people-links', employeeId];
  const {data, isLoading, error, refetch} = useQuery({queryKey, queryFn: () => EmsService.getEmployeePeopleLinks(employeeId, token)});
  const [editing, setEditing] = useState<'hod' | 'relievers' | null>(null);
  const [first, setFirst] = useState('NONE'), [second, setSecond] = useState('NONE'), [hod, setHod] = useState('NONE');
  const [hodChoosing, setHodChoosing] = useState(false), [crossBranchConfirmed, setCrossBranchConfirmed] = useState(false);
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
  const hodPerson = data?.hodOptions.find(person => person.target === hod) ?? (data?.hod.target === hod ? data.hod.person ?? undefined : undefined);
  const branch = data?.branchLabel === 'Branch not specified' ? '' : data?.branchLabel ?? '';
  const scope = `${data?.departmentName || 'Department not set'} · ${data?.branchLabel || 'Branch not specified'}`;
  const hodChanged = hod !== (data?.hod.target ?? 'NONE') || data?.hasHodAssignment === false || data?.hod.state === 'NEEDS_ATTENTION';
  const hodAllowed = !hodBranchNeedsConfirmation(hodPerson, branch) || crossBranchConfirmed;
  useEffect(() => {setCrossBranchConfirmed(false);}, [hod, data?.hodVersion, hodPerson?.branch]);
  function begin(kind: 'hod' | 'relievers') {
    if (!data) return;
    setFeedback(null); saveRelievers.reset(); saveHod.reset(); setEditing(kind);setHodChoosing(kind === 'hod');setCrossBranchConfirmed(false);
    setFirst(data.first.target ?? 'NONE'); setSecond(data.second.target ?? 'NONE'); setHod(data.hod.target ?? 'NONE');
    setVersion(kind === 'hod' ? data.hodVersion : data.version);
  }
  return <section id="hod-and-relievers" className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
    <h2 className="font-semibold text-foreground">HOD and relievers</h2>
    {isLoading && <p className="text-sm text-muted-foreground">Loading people links…</p>}
    {error && <div role="alert" className="text-sm text-danger">Could not load the people links. <Button variant="ghost" type="button" className="underline h-auto whitespace-normal" onClick={() => refetch()}>Retry</Button></div>}
    {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
    {data && <>
      <div className="space-y-2 border-b border-border pb-4">
        <h3 className="text-sm font-semibold">Department HOD</h3>
        <p className="text-xs text-muted-foreground"><strong>HOD for:</strong> {scope}</p>
        {editing !== 'hod' && <>
          {data.hod.person ? <PersonSummary person={data.hod.person} /> : <PersonLinkStatus link={data.hod} />}
          {data.hod.person && data.hod.error && <p className="text-xs text-danger">{data.hod.error}</p>}
          {data.hod.person && data.hod.warning && <p className="text-xs text-warning">{data.hod.warning}</p>}
        </>}
        {data.previousHod && <details className="text-xs text-warning"><summary className="cursor-pointer">Previously recorded HOD · needs confirmation</summary>
          <p className="mt-1">{[data.previousHod.name, data.previousHod.designation].filter(Boolean).join(' · ')}. Choose and save the department HOD to confirm the linked person.</p></details>}
        {editing === 'hod' ? <div className="space-y-3">
          {hodChoosing ? <HodChooser id={`profile-hod-${employeeId}`} value={hod} options={data.hodOptions}
            directory={data.hodDirectory ?? []} suggestions={data.recordedHodSuggestions ?? []} departmentId={data.departmentId}
            department={data.departmentName} branch={branch} disabled={busy}
            onChoose={target => {setHod(target);setHodChoosing(false);}} /> : <>
            {hodPerson ? <PersonSummary person={hodPerson} /> : <p className="text-sm text-foreground">{hod === 'NONE' ? 'Not assigned' : 'Current choice retained'}</p>}
            <Button variant="ghost" type="button" disabled={busy} onClick={() => setHodChoosing(true)} className="text-xs font-semibold text-primary underline h-auto whitespace-normal">Change choice</Button>
          </>}
          {hodChanged && !hodChoosing && <HodAppointmentReview scope={scope} person={hodPerson} unassigned={hod === 'NONE'} branch={branch}
            confirmed={crossBranchConfirmed} onConfirm={setCrossBranchConfirmed} disabled={busy} />}
          {!hodChoosing && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">What will this save change?</summary>
            <p className="mt-1">The shared HOD for everyone in {scope}. The person’s workplace and access role stay the same.</p></details>}
          {saveHod.error && <p role="alert" className="text-sm text-danger">{saveHod.error.message}</p>}
          {!hodChoosing && <Button variant="ghost" type="button" disabled={busy || !hod || !hodChanged || !hodAllowed} onClick={() => {if (hodChanged && hodAllowed) saveHod.mutate();}} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50 h-auto whitespace-normal">{busy ? 'Saving…' : 'Save department HOD'}</Button>}
        </div> : <Button variant="ghost" type="button" disabled={!!editing || !data.departmentId} onClick={() => begin('hod')} className="text-sm font-medium text-primary underline disabled:opacity-50 h-auto whitespace-normal">Change department HOD</Button>}
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
        <p className="text-xs text-muted-foreground">Keep a pending choice or replace it with a registered employee. Replacing it prevents the old pending link from being applied later.</p>
        {saveRelievers.error && <p role="alert" className="text-sm text-danger">{saveRelievers.error.message}</p>}
        <Button variant="ghost" type="button" disabled={busy || !first || !second || (first !== 'NONE' && first === second)} onClick={() => saveRelievers.mutate()}
          className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50 h-auto whitespace-normal">{busy ? 'Saving…' : 'Save relievers'}</Button>
      </div> : <Button variant="ghost" type="button" disabled={!!editing} onClick={() => begin('relievers')} className="text-sm font-medium text-primary underline disabled:opacity-50 h-auto whitespace-normal">Change relievers</Button>}
      {editing && <Button variant="ghost" type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-2 text-sm h-auto whitespace-normal">Cancel changes</Button>}
    </>}
  </section>;
}
