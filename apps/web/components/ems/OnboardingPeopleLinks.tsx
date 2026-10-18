"use client";
import { useEffect, useState } from 'react';
import type { DepartmentHodResolution, OnboardingBatchDetail, PersonLinkResolution, ReportingOption } from '@/services/ems.service';

export const personOptionLabel = (person: ReportingOption) => [person.name, person.designation, person.department, person.branch, person.employeeCode,
  person.target.startsWith('record:') ? 'Pending registration' : 'Existing employee'].filter(Boolean).join(' · ');

export function PersonLinkPicker({id, label, value, options, disabled, onChange, allowImported = false, error}: {
  id: string; label: string; value: string; options: ReportingOption[]; disabled?: boolean; allowImported?: boolean;
  onChange: (target: string) => void; error?: string | null;
}) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLocaleLowerCase();
  const filtered = options.filter(p => p.target === value || !needle || personOptionLabel(p).toLocaleLowerCase().includes(needle))
    .slice().sort((a, b) => a.name.localeCompare(b.name));
  const missing = value && value !== 'NONE' && !options.some(p => p.target === value);
  return <div className="min-w-0 space-y-2">
    <label className="block text-xs font-semibold text-slate-700" htmlFor={id}>{label}</label>
    <input type="search" aria-label={`Search ${label.toLowerCase()}`} value={search} disabled={disabled}
      onChange={e => setSearch(e.target.value)} placeholder="Search name, code, designation or department"
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100" />
    <select id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
      aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined}
      className={`w-full min-w-0 max-w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-slate-100 ${error ? 'border-red-300' : 'border-slate-300'}`}>
      <option value="">{allowImported ? 'Resolve from imported name and designation' : 'Choose a person'}</option>
      <option value="NONE">Not assigned</option>
      {missing && <option value={value} disabled>Current selection — see saved details</option>}
      {filtered.map(p => <option key={p.target} value={p.target}>{personOptionLabel(p)}</option>)}
    </select>
    {needle && filtered.length === 0 && <p className="text-xs text-slate-500">No matching people. Try another name or code.</p>}
    {error && <p id={`${id}-error`} className="text-xs text-red-700">{error}</p>}
  </div>;
}

export function PersonLinkStatus({link, showError = true}: {link: PersonLinkResolution; showError?: boolean}) {
  return <div className="text-xs space-y-1 break-words">
    <p className="text-slate-700">{link.person ? personOptionLabel(link.person) : link.state === 'UNASSIGNED' ? 'Not assigned' : 'Selection needs review'}</p>
    {showError && link.error && <p className="text-red-700">{link.error}</p>}
    {link.warning && <p className="text-amber-700">{link.warning}</p>}
  </div>;
}

export function DepartmentHodEditor({recordId, hod, options, importedName, importedDesignation, disabled, recordDirty,
  onDirtyChange, onSave, onSaved}: {
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
  const dirty = choice !== baseline;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) { setChoice(initial); setBaseline(initial); setVersion(hod.version); }
  }, [initial, hod.version, dirty]);
  async function save() {
    if (!choice || disabled || recordDirty || saving) return;
    setSaving(true); setError(null);
    try {
      const batch = await onSave(choice, version);
      setBaseline(choice); onDirtyChange(false); onSaved(batch);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the HOD. Your selection is still here.'); }
    finally { setSaving(false); }
  }
  return <section data-editor-field="hodName" tabIndex={-1} className="space-y-3 rounded-xl border border-purple-200 bg-white p-3">
    <h3 className="text-sm font-semibold text-slate-800">Department HOD</h3>
    <p className="text-xs text-slate-600">{hod.departmentName || 'Department not set'} · {hod.branchLabel}</p>
    <PersonLinkStatus link={hod} />
    {!!(importedName || importedDesignation) && <p className="text-xs text-slate-500">Imported: {[importedName, importedDesignation].filter(Boolean).join(' · ')}</p>}
    <PersonLinkPicker id={`hod-${recordId}`} label="HOD person" value={choice} options={options}
      disabled={disabled || saving || recordDirty || !hod.departmentId} onChange={value => {setChoice(value); setError(null);}} />
    {!hod.reviewKey && hod.suggestedTarget && <p className="text-xs text-amber-700">Suggested from the import. Save the department HOD to confirm.</p>}
    <p className="text-xs text-slate-600">Saving sets the HOD for this department and branch and confirms the choice for {hod.affectedRecords} active record(s) in this import. Access permissions stay separate.</p>
    {recordDirty && <p className="text-xs text-amber-700">Save your record edits before changing the department HOD.</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || recordDirty || saving || !choice || !hod.departmentId}
        onClick={save} className="rounded-lg bg-purple-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving HOD…' : 'Save department HOD'}</button>
      {dirty && <button type="button" disabled={saving || disabled} onClick={() => {setChoice(initial);setBaseline(initial);setVersion(hod.version);setError(null);}}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Discard HOD change</button>}
    </div>
  </section>;
}
