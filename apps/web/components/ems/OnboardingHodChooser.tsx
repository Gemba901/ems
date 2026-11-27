"use client";

import { useEffect, useState } from 'react';
import type { HodDirectoryEntry, PersonSuggestion, ReportingOption } from '@/services/ems.service';
import { PersonLinkPicker } from './OnboardingPersonPicker';
import { personBranchKey } from './onboarding-person-search';
import { hodPickerModel } from './onboarding-hod-picker';
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export function hodBranchNeedsConfirmation(person: ReportingOption | undefined, branch: string) {
  return !!person && personBranchKey(person.branch) !== personBranchKey(branch);
}

export function HodAppointmentReview({scope, person, branch, confirmed, onConfirm, disabled}: {
  scope: string; person?: ReportingOption; unassigned: boolean; branch: string; confirmed: boolean;
  onConfirm: (value: boolean) => void; disabled: boolean;
}) {
  if (!hodBranchNeedsConfirmation(person, branch)) return null;
  return <div className="rounded-lg border border-warning/50 bg-warning-subtle p-3 text-xs text-warning">
    <p><strong>{person?.name}</strong> is based at {person?.department || 'Department not recorded'} · {person?.branch || 'Branch not recorded'}.</p>
    <label className="mt-2 flex items-start gap-2 font-medium">
      <Checkbox disabled={disabled} checked={confirmed} onCheckedChange={(checked) => onConfirm(checked)} className="mt-0.5 shrink-0" />
      <span>{person?.branch && branch ? `Confirm they should head ${scope} across branches.`
        : `A branch is missing. Confirm they should head ${scope}.`}</span>
    </label>
  </div>;
}

export function HodChooser({id, value, options, directory = [], suggestions = [], importedSuggestions = [], importedName, importedDesignation,
  departmentId, department, branch, disabled, onChoose}: {
  id: string; value: string; options: ReportingOption[]; directory?: HodDirectoryEntry[]; suggestions?: PersonSuggestion[];
  importedSuggestions?: PersonSuggestion[]; importedName?: string | null; importedDesignation?: string | null;
  departmentId: string | null; department: string; branch: string; disabled: boolean; onChoose: (target: string) => void;
}) {
  const [otherBranches, setOtherBranches] = useState(false), [existingOnly, setExistingOnly] = useState(false);
  useEffect(() => {setOtherBranches(false);setExistingOnly(false);}, [departmentId, branch]);
  const model = hodPickerModel(options, directory, [...suggestions, ...importedSuggestions]);
  const sameBranch = (person: ReportingOption) => personBranchKey(person.branch) === personBranchKey(branch);
  const evidence = model.people.filter(person => model.reasons.has(person.target) && (otherBranches || sameBranch(person)));
  return <div className="space-y-2">
    <PersonLinkPicker id={id} label="Find a HOD" value={value} options={existingOnly ? model.existing : model.people}
      currentPerson={model.people.find(person => person.target === value)}
      notes={model.notes} preferredDepartment={department} preferredBranch={branch} includeOtherBranches={otherBranches}
      onOtherBranchesChange={setOtherBranches} disabled={disabled} onChange={onChoose} showCurrentChoice={false}
      filterKey={`${existingOnly}:${otherBranches}:${departmentId}:${branch}`}
      controls={<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div role="group" aria-label="HOD choices" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {[false, true].map(existing => <Button variant="ghost" key={String(existing)} type="button" disabled={disabled} aria-pressed={existingOnly === existing}
            onClick={() => setExistingOnly(existing)} className={`h-auto whitespace-normal rounded-md px-3 py-2 font-medium disabled:opacity-50 ${existingOnly === existing ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/10'}`}>
            {existing ? 'Existing HODs' : 'All people'}</Button>)}
        </div>
        <label className="flex items-center gap-2 py-2 text-foreground">
          <Checkbox checked={otherBranches} disabled={disabled} onCheckedChange={(checked) => setOtherBranches(checked)} />
          Include other branches
        </label>
      </div>} />
    <p className="text-xs text-muted-foreground">{otherBranches ? 'All branches' : branch || 'Branch not specified'} · {existingOnly ? 'Confirmed HOD appointments only.' : 'Registered employees and eligible import records.'}</p>
    {(evidence.length > 0 || importedName || importedDesignation) && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-primary">Why suggested / imported details</summary>
      {(importedName || importedDesignation) && <p className="mt-2">Imported: {[importedName, importedDesignation].filter(Boolean).join(' · ')}</p>}
      <p className="mt-1">Suggestions need your confirmation. Matching text does not establish identity.</p>
      <ul className="mt-2 space-y-2">{evidence.map(person => <li key={person.target}>
        <p className="font-medium">{person.name} · {person.employeeCode || 'No employee code'}</p>
        <ul className="mt-1 space-y-1">{model.reasons.get(person.target)?.map(reason => <li key={reason}>{reason}</li>)}</ul>
      </li>)}</ul>
    </details>}
    {existingOnly && model.unavailable.length > 0 && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Other saved HOD appointments ({model.unavailable.length})</summary>
      <ul className="mt-2 space-y-2">{model.unavailable.map(entry => <li key={entry.key}>
        {entry.person?.name || 'Person unavailable'} — HOD for {entry.department} · {entry.branch}.
        <p>{entry.note || 'Not eligible to select here. Review the existing assignment.'}</p>
      </li>)}</ul>
    </details>}
  </div>;
}
