"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReportingOption } from '@/services/ems.service';
import { orderPeopleChoices, personBranchKey, personSearchKey, searchPeople } from './onboarding-person-search';
import type {PersonChoiceNote} from './onboarding-hod-picker';
import { isReportingBody, REPORTING_BODIES, reportingBodyLabel } from './reporting-bodies';

type Choice = {value: string; name: string; detail?: string; group: string; note?: PersonChoiceNote};

export function PersonLinkPicker({id, label, value, options, disabled, onChange, allowImported = false,
  error, invalid, describedBy, preferredDepartment, preferredBranch, allowBoard = false, includeOtherBranches, onOtherBranchesChange,
  controls, notes, filterKey, showCurrentChoice = true, currentPerson}: {
  id: string; label: string; value: string; options: ReportingOption[]; disabled?: boolean; allowImported?: boolean;
  onChange: (target: string) => void; error?: string | null; invalid?: boolean; describedBy?: string;
  preferredDepartment?: string | null; preferredBranch?: string | null; allowBoard?: boolean;
  includeOtherBranches?: boolean; onOtherBranchesChange?: (value: boolean) => void;
  controls?: ReactNode; notes?: Record<string, PersonChoiceNote>; filterKey?: string; showCurrentChoice?: boolean;
  currentPerson?: ReportingOption;
}) {
  const selected = options.find(p => p.target === value) ?? (currentPerson?.target === value ? currentPerson : undefined);
  const selectedName = selected?.name ?? (value === 'NONE' ? 'Not assigned' : reportingBodyLabel(value))
    ?? (value ? 'Current selection unavailable — review saved details' : '');
  const [search, setSearch] = useState(selectedName);
  const [open, setOpen] = useState(false), [localOtherBranches, setLocalOtherBranches] = useState(false);
  const showOtherBranches = includeOtherBranches ?? localOtherBranches;
  const setShowOtherBranches = (value: boolean) => {setLocalOtherBranches(value);onOtherBranchesChange?.(value);};
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const department = personSearchKey(preferredDepartment), branch = personBranchKey(preferredBranch);
  const branchRestricted = preferredBranch !== undefined && preferredBranch !== null;
  const sameBranch = (person: ReportingOption) => personBranchKey(person.branch) === branch;
  const available = branchRestricted && !showOtherBranches ? options.filter(sameBranch) : options;
  const searching = !!personSearchKey(search);
  const filtered = orderPeopleChoices(available, search, preferredDepartment, preferredBranch);
  const personGroup = (person: ReportingOption) => branchRestricted
    ? sameBranch(person) ? department && personSearchKey(person.department) === department ? 'Same department and branch' : 'Same branch · other departments' : 'Other branches'
    : department ? personSearchKey(person.department) === department ? 'Same department' : 'Other departments' : 'People';
  const choices: Choice[] = [];
  // A typed search keeps name rank across all allowed branches; blank browsing groups by workplace.
  for (const person of filtered) {
    choices.push({value:person.target, name:person.name, group:searching ? 'Name matches' : personGroup(person), note:notes?.[person.target],
      detail:[person.designation, person.employeeCode, person.department, person.branch,
        person.target.startsWith('record:') ? 'Pending registration' : 'Registered employee'].filter(Boolean).join(' · ')});
  }
  const actions: Choice[] = [
    ...(allowImported ? [{value:'',name:'Use imported name and job title',group:'Other choices'}] : []),
    ...(allowBoard ? REPORTING_BODIES.map(body => ({value:body.value,name:body.label,detail:'Top-level reporting body · no individual manager',group:'Other choices'}))
      : [{value:'NONE',name:'Not assigned',group:'Other choices'}]),
  ].filter(choice => !search.trim() || personSearchKey(choice.name).includes(personSearchKey(search)));
  choices.push(...actions);
  const outsideBranchCount = branchRestricted ? searchPeople(options.filter(p => !sameBranch(p)), search).length : 0;
  const restore = () => {setSearch(selectedName);setOpen(false);setActive(-1);};
  function choose(choice: Choice) {
    setSearch(choice.value ? choice.name : '');setOpen(false);setActive(-1);
    onChange(choice.value);
    // Keep the input focused without reopening results or scrolling the page.
    input.current?.focus({preventScroll:true});
  }
  function start() {setSearch('');setOpen(true);setActive(-1);}
  useEffect(() => {setSearch(selectedName);setOpen(false);setActive(-1);}, [value, selectedName]);
  useEffect(() => {if (disabled) {setOpen(false);setSearch(selectedName);}}, [disabled, selectedName]);
  useEffect(() => {setLocalOtherBranches(false);}, [preferredBranch, preferredDepartment]);
  useEffect(() => {setActive(-1);}, [filterKey, includeOtherBranches]);
  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>(`[data-choice-index="${active}"]`);
    if (!item || !list.current) return;
    const parent = list.current.getBoundingClientRect(), rect = item.getBoundingClientRect();
    if (rect.top < parent.top) list.current.scrollTop -= parent.top - rect.top;
    else if (rect.bottom > parent.bottom) list.current.scrollTop += rect.bottom - parent.bottom;
  }, [active, open]);
  const help = `${id}-search-help`, errorId = `${id}-error`;
  return <div className="min-w-0 space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) restore();
  }}>
    <label className="block text-xs font-semibold text-slate-700" htmlFor={id}>{label}</label>
    {controls}
    <div className="flex min-w-0 rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-purple-500">
      <input ref={input} id={id} type="text" role="combobox" autoComplete="off" value={search} disabled={disabled}
        aria-expanded={open && !disabled} aria-autocomplete="list" aria-controls={`${id}-results`}
        aria-activedescendant={open && active >= 0 && active < choices.length ? `${id}-choice-${active}` : undefined}
        aria-invalid={!!error || invalid || undefined} aria-describedby={[help, describedBy, error ? errorId : null].filter(Boolean).join(' ')}
        onFocus={() => {if (!open) start();}} onClick={() => {if (!open) start();}}
        onChange={event => {setSearch(event.target.value);setOpen(true);setActive(0);}}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();restore();}
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();if (!open) {start();return;}
            setActive(previous => choices.length ? event.key === 'ArrowDown' ? Math.min(previous + 1, choices.length - 1) : previous < 0 ? choices.length - 1 : Math.max(previous - 1, 0) : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault();event.stopPropagation();
            if (open && active >= 0 && choices[active]) choose(choices[active]);
            else if (!open) start();
          }
        }} placeholder={allowImported ? 'Search people or use imported details' : 'Search by name'}
        className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm outline-none disabled:bg-slate-100" />
      <button type="button" disabled={disabled} aria-label={`${open ? 'Close' : 'Open'} ${label.toLowerCase()} choices`}
        onMouseDown={event => event.preventDefault()}
        onClick={() => {if (open) restore();else {input.current?.focus({preventScroll:true});start();}}}
        className="shrink-0 rounded-r-lg px-3 text-purple-800 disabled:opacity-50"><span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
    </div>
    <p id={help} className={open ? 'text-xs text-slate-500' : 'sr-only'} role="status">
      {open ? `${filtered.length} ${searching ? 'name matches · exact names, then starting with, then containing' : 'people · same department and branch first'}.` : 'Type to search. Choosing prepares a change; use Save to confirm it.'}
      <span className="sr-only"> Use arrow keys and Enter to choose. Escape closes without selecting.</span>
    </p>
    {open && !disabled && <>
      <div ref={list} id={`${id}-results`} role="listbox" aria-label={`${label} choices`}
        className="max-h-56 overflow-y-auto rounded-lg border border-purple-200 bg-white py-1">
        {choices.map((choice,index) => <div key={choice.value}>
          {(index === 0 || choices[index-1].group !== choice.group) && <p className="px-3 py-1 text-xs font-semibold text-slate-500">{choice.group}</p>}
          <div role="option" id={`${id}-choice-${index}`} data-choice-index={index} aria-selected={choice.value === value}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(choice)} onMouseEnter={() => setActive(index)}
            className={`cursor-pointer break-words px-3 py-2 text-sm ${active === index ? 'bg-purple-100 text-purple-950' : 'text-slate-800 hover:bg-purple-50'}`}>
            <p className="font-medium">{choice.name}{choice.value === value && <span className="ml-2 text-xs text-purple-800">Selected</span>}
              {choice.note?.badge && <span className="ml-2 text-xs font-normal text-purple-800">{choice.note.badge}</span>}</p>
            {choice.detail && <p className="mt-0.5 text-xs text-slate-500">{choice.detail}</p>}
            {choice.note?.detail && <p className="mt-0.5 text-xs text-purple-800">{choice.note.detail}</p>}
          </div>
        </div>)}
        {!choices.length && <p className="px-3 py-2 text-sm text-slate-600">No matching choices. Change the search.</p>}
      </div>
      {branchRestricted && !onOtherBranchesChange && <button type="button" onClick={() => {setShowOtherBranches(!showOtherBranches);setActive(-1);}}
        className="text-xs font-semibold text-purple-800 underline">{showOtherBranches ? 'Show this branch only' : `Choose from other branches${outsideBranchCount ? ` (${outsideBranchCount})` : ''}`}</button>}
      {showCurrentChoice && !!value && <p className="text-xs text-slate-500">Current choice: {selectedName}. Typing alone does not change it.</p>}
    </>}
    {value && value !== 'NONE' && !isReportingBody(value) && !selected && <p className="text-xs text-amber-800">Current selection is retained. Review its saved details before replacing it.</p>}
    {allowBoard && <p className="text-xs text-slate-500">Choose a person for a named owner or committee member; choose a body when the relationship is to the body itself.</p>}
    {error && <p id={errorId} className="text-xs text-red-700">{error}</p>}
  </div>;
}
