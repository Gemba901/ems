"use client";
import Link from 'next/link';
import { personViewLink } from './onboarding-hod-picker';
import { PersonLinkPicker } from './OnboardingPersonPicker';
export { PersonLinkPicker } from './OnboardingPersonPicker';
import { HodChooser, HodAppointmentReview, hodBranchNeedsConfirmation } from './OnboardingHodChooser';

import { personSearchKey } from './onboarding-person-search';
import { useEffect, useRef, useState } from 'react';
import type { DepartmentHodResolution, HodDirectoryEntry, HodEvidence, OnboardingBatchDetail, PersonLinkResolution, PersonSuggestion, ReportingOption } from '@/services/ems.service';

export const personOptionLabel = (person: ReportingOption) => [person.name, person.designation, person.department, person.branch, person.employeeCode,
  person.target.startsWith('record:') ? 'Pending registration' : 'Existing employee'].filter(Boolean).join(' · ');

export function PersonSummary({person}: {person: ReportingOption}) {
  const destination = personViewLink(person);
  return <div className="min-w-0 text-sm text-slate-800 break-words">
    <p className="font-semibold">{destination ? <Link href={destination.href} target="_blank" rel="noopener noreferrer"
      aria-label={`${destination.label}: ${person.name} (new tab)`} className="text-purple-800 underline decoration-purple-300 underline-offset-2 hover:decoration-purple-800">
      {person.name}<span aria-hidden="true" className="ml-1 text-xs">↗</span></Link> : person.name}</p>
    <p className="text-xs text-slate-600">{[person.designation, person.employeeCode].filter(Boolean).join(' · ')}</p>
    <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Person details</summary>
      <p>Person’s workplace: {[person.department, person.branch || 'Branch not specified'].filter(Boolean).join(' · ')}</p>
      <p>{person.target.startsWith('record:') ? 'Pending registration' : 'Registered employee'}</p>
    </details>
  </div>;
}

/** Candidate hints never save or assign automatically. */
export function PersonSuggestions({label, candidates, importedName, importedDesignation, disabled, onChoose}: {
  label: string; candidates: PersonSuggestion[]; importedName?: string | null; importedDesignation?: string | null;
  disabled: boolean; onChoose: (target: string) => void;
}) {
  if (!candidates.length) return null;
  return <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs" data-person-suggestions={label}>
    <summary className="cursor-pointer font-semibold text-amber-950">Possible {label} matches ({candidates.length}) — review and choose</summary>
    <p className="mt-2 break-words text-slate-700"><strong>Imported:</strong> {importedName || 'Name missing'} · {importedDesignation || 'Job title missing'}</p>
    <p className="mt-1 text-amber-900">These are suggestions, not confirmed identities. Compare the details; choosing prepares a change that you must save.</p>
    <ul className="mt-2 space-y-2">{candidates.map(person => <li key={person.target} className="rounded border border-amber-200 bg-white p-2 space-y-2">
      <p className="break-words text-slate-800"><strong>Recorded:</strong> {personOptionLabel(person)}</p>
      <p className="text-amber-900">{person.suggestionReasons?.join(' · ') || 'Possible name match — check all details and confirm.'}</p>
      <button type="button" disabled={disabled} onClick={() => onChoose(person.target)}
        aria-label={`Choose ${person.name} for ${label}`}
        className="rounded border border-purple-300 px-3 py-2 font-semibold text-purple-800 disabled:opacity-50">Choose this person</button>
    </li>)}</ul>
  </details>;
}

/** One display for a resolved reliever; imported text remains editable when needed. */
export function RelieverEditor({id, label, value, options, link, name, designation, department, disabled, suggestionsCurrent = true, onChange, onTextChange}: {
  id: string; label: string; value: string; options: ReportingOption[]; link: PersonLinkResolution;
  name: string; designation: string; department?: string | null; disabled: boolean; suggestionsCurrent?: boolean;
  onChange: (target: string) => void; onTextChange: (field: 'Name' | 'Designation', value: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const explicit = options.find(p => p.target === value);
  const imported = !value && !link.error && link.person && personSearchKey(name) === personSearchKey(link.person.name)
    && personSearchKey(designation) === personSearchKey(link.person.designation) ? link.person : null;
  const person = explicit ?? imported;
  const summary = !!person || value === 'NONE';
  return <div className="space-y-2">
    <h4 className="text-xs font-semibold text-slate-700">{label}</h4>
    {summary && !changing ? <>
      <p className="text-xs text-slate-700 break-words">{person ? `${imported ? 'Matched from imported fields' : 'Selected'}: ${personOptionLabel(person)}` : 'Not assigned'}</p>
      {person?.target.startsWith('record:') && <p className="text-xs text-amber-700">Assignment completes when this person registers.</p>}
      <button type="button" disabled={disabled} onClick={() => setChanging(true)} className="text-xs font-semibold text-purple-800 underline disabled:opacity-50">Change {label.toLowerCase()}</button>
    </> : <>
      <PersonLinkPicker id={id} label={`${label} person`} value={value} options={options} preferredDepartment={department}
        allowImported disabled={disabled} onChange={target => {onChange(target); setChanging(false);}} />
      {summary && <button type="button" onClick={() => setChanging(false)} className="text-xs text-purple-800 underline">Close chooser</button>}
    </>}
    {!value && !imported && suggestionsCurrent && <PersonSuggestions label={label.toLowerCase()} candidates={link.suggestions ?? []}
      importedName={name} importedDesignation={designation} disabled={disabled} onChoose={target => {onChange(target); setChanging(false);}} />}
    {!value && !imported && <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-slate-600">Imported name<input aria-label={`${label} imported name`} value={name} disabled={disabled}
        onChange={e => onTextChange('Name', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" /></label>
      <label className="text-xs text-slate-600">Imported job title<input aria-label={`${label} imported job title`} value={designation} disabled={disabled}
        onChange={e => onTextChange('Designation', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" /></label>
      <p className="text-xs text-slate-500 sm:col-span-2">Choose a person, or correct these imported fields and save to match them.</p>
    </div>}
  </div>;
}

export function PersonLinkStatus({link, showError = true}: {link: PersonLinkResolution; showError?: boolean}) {
  return <div className="text-xs space-y-1 break-words">
    {link.person ? <PersonSummary person={link.person} /> : <p className="text-slate-700">{link.state === 'UNASSIGNED' ? 'Not assigned' : 'Selection needs review'}</p>}
    {showError && link.error && <p className="text-red-700">{link.error}</p>}
    {link.warning && <p className="text-amber-700">{link.warning}</p>}
  </div>;
}

export function DepartmentHodEditor({recordId, hod, options, importedName, importedDesignation, disabled, recordDirty,
  onDirtyChange, onSave, onSaved, directory = [], evidence}: {
  evidence?: HodEvidence; directory?: HodDirectoryEntry[];
  recordId: string; hod: DepartmentHodResolution; options: ReportingOption[];
  importedName?: string | null; importedDesignation?: string | null; disabled: boolean; recordDirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (target: string, version: string) => Promise<OnboardingBatchDetail>;
  onSaved: (batch: OnboardingBatchDetail) => void;
}) {
  const initial = hod.target ?? (hod.reviewKey ? 'NONE' : hod.suggestedTarget ?? '');
  const [choice, setChoice] = useState(initial), [baseline, setBaseline] = useState(initial);
  const [version, setVersion] = useState(hod.version), [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [crossBranchConfirmed, setCrossBranchConfirmed] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null), returnFocus = useRef(false);
  useEffect(() => { if (!choosing && returnFocus.current) { changeButton.current?.focus({preventScroll:true}); returnFocus.current=false; } }, [choosing, choice]);
  const selectedPerson = options.find(p => p.target === choice) ?? directory.find(entry => entry.target === choice)?.person ?? undefined;
  const dirty = choice !== baseline;
  const scope = `${hod.departmentName || 'Department not set'} · ${hod.branchLabel}`;
  useEffect(() => {setCrossBranchConfirmed(false);}, [choice, hod.version, selectedPerson?.branch]);
  const crossBranch = hodBranchNeedsConfirmation(selectedPerson, hod.branchLabel === 'Branch not specified' ? '' : hod.branchLabel);
  const confirmationAllowed = !crossBranch || crossBranchConfirmed;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) { setChoice(initial); setBaseline(initial); setVersion(hod.version); }
  }, [initial, hod.version, dirty]);
  async function save() {
    if (!choice || disabled || recordDirty || saving || !confirmationAllowed) return;
    setSaving(true); setError(null);
    try {
      const batch = await onSave(choice, version);
      setBaseline(choice); setChoosing(false); onDirtyChange(false); onSaved(batch);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the HOD. Your selection is still here.'); }
    finally { setSaving(false); }
  }
  const unavailable = disabled || saving || recordDirty || !hod.departmentId;
  const confirmNeeded = !!choice && (dirty || !hod.reviewKey || !!hod.error);
  const summaryState = dirty ? 'Unsaved choice' : hod.reviewKey && !hod.error ? 'Confirmed' : selectedPerson ? 'Suggested · needs confirmation' : 'Needs a choice';
  const select = (target: string) => {returnFocus.current=true;setChoice(target);setChoosing(false);setError(null);};
  const sameEntry = evidence?.groups.length === 1 && evidence.blank === 0 && !!evidence.groups[0].name && !!evidence.groups[0].designation;
  return <section data-editor-field="hodName" tabIndex={-1} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-slate-800">Department HOD</h3>
        <p className="text-xs text-slate-600"><strong>HOD for:</strong> {scope}</p></div>
      <span className={`text-xs ${summaryState === 'Confirmed' ? 'text-emerald-700' : 'text-amber-800'}`}>{summaryState}</span>
    </div>
    {selectedPerson ? <PersonSummary person={selectedPerson} /> : <p className="text-sm text-slate-700">{choice === 'NONE' ? 'Not assigned' : importedName ? `Imported: ${importedName} · ${importedDesignation || 'Job title missing'}` : 'No HOD selected'}</p>}
    {selectedPerson?.target.startsWith('record:') && <p className="text-xs text-amber-800">Link completes after registration.</p>}
    {hod.error && hod.error !== 'Review the imported HOD and save the department HOD choice.' && hod.departmentId && !dirty && <p className="text-xs text-amber-800">{hod.error}</p>}
    {evidence && <details className="text-xs text-slate-600" data-hod-evidence>
      <summary className="cursor-pointer underline underline-offset-2">Imported evidence: {sameEntry
        ? evidence.total === 1 ? `this record names ${evidence.groups[0].name} as HOD` : `${evidence.groups[0].count} of ${evidence.total} records name ${evidence.groups[0].name} as HOD`
        : `${evidence.total} records · ${evidence.groups.length} HOD entries · ${evidence.blank} blank`}</summary>
      <p className="mt-2 text-slate-500">Counts cover {scope} in this import only, across all pages. Registered records included; excluded records omitted. Matching text does not confirm identity.</p>
      {evidence.groups.map((group,i)=><details key={i} className="mt-2"><summary className="cursor-pointer">{group.count} {group.count === 1 ? 'record' : 'records'}: {group.name || 'Name missing'} · {group.designation || 'Job title missing'}</summary>
        <ul className="mt-1 space-y-1">{group.records.map(person=><li key={person.id}>{person.name} · {person.employeeCode || 'No code'} · {person.rowNumber == null ? 'Excel row unavailable' : `Excel row ${person.rowNumber}`}</li>)}</ul></details>)}
    </details>}
    {!hod.departmentId && <p className="text-xs text-amber-800">Choose a recognised, unique department and save the record first.</p>}
    {recordDirty && <p className="text-xs text-amber-800">Save your record edits before changing its department HOD.</p>}
    {!choice && !!(hod.recordedSuggestions?.length || hod.suggestions?.length) && !choosing && <p className="text-xs text-purple-800">Possible matches available in Choose HOD.</p>}
    {choosing && <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/30 p-3" data-hod-chooser>
      <HodChooser id={`hod-${recordId}`} value={choice} options={options} directory={directory}
        suggestions={hod.recordedSuggestions ?? []} departmentId={hod.departmentId} department={hod.departmentName}
        importedSuggestions={hod.suggestions ?? []} importedName={importedName} importedDesignation={importedDesignation}
        branch={hod.branchLabel === 'Branch not specified' ? '' : hod.branchLabel} disabled={unavailable} onChoose={select} />
      <button type="button" disabled={saving} onClick={()=>{returnFocus.current=true;setChoosing(false);}} className="text-xs text-slate-600 underline">Close chooser</button>
    </div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {confirmNeeded && !choosing && <HodAppointmentReview scope={scope} person={selectedPerson} unassigned={choice === 'NONE'}
      branch={hod.branchLabel === 'Branch not specified' ? '' : hod.branchLabel} confirmed={crossBranchConfirmed}
      onConfirm={setCrossBranchConfirmed} disabled={unavailable} />}
    {confirmNeeded && !choosing && <details className="text-xs text-slate-500"><summary className="cursor-pointer">What will this save change?</summary>
      <p className="mt-1">The shared HOD for {scope}. {hod.affectedRecords} active import {hod.affectedRecords === 1 ? 'record' : 'records'} will be confirmed here. The person’s workplace and access role stay the same.</p></details>}
    <div className="flex flex-wrap items-center gap-3">
      {confirmNeeded && !choosing && <button type="button" disabled={unavailable || !confirmationAllowed} onClick={save}
        className="rounded-lg bg-purple-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving HOD…' : dirty || hod.reviewKey ? 'Save HOD change' : 'Confirm HOD'}</button>}
      {!choosing && <button ref={changeButton} type="button" disabled={unavailable} onClick={()=>{setChoosing(true);}} className="text-xs font-semibold text-purple-800 underline disabled:opacity-50">{choice ? 'Change HOD' : 'Choose HOD'}</button>}
      {dirty && <button type="button" disabled={saving || disabled} onClick={()=>{returnFocus.current=true;setChoice(initial);setBaseline(initial);setVersion(hod.version);setError(null);setChoosing(false);}}
        className="text-xs text-slate-600 underline">Discard HOD change</button>}
    </div>
  </section>;
}
