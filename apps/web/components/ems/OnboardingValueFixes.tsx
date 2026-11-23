"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  VALUE_FIX_CHOICES, VALUE_FIX_FIELD_LABELS, blankStatusRecords, rememberedChoice, valueFixAllowed, valueFixGroups,
  type RememberedChoice, type ValueFixField, type ValueFixGroup, type ValueFixRequest,
} from "./onboarding-value-fixes";

type Records = Parameters<typeof valueFixGroups>[0];
const plural = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

/**
 * "Values to sort out": each odd value in Access level, Employment status, Employment type and Gender once, with a count
 * and a "Treat as" choice that fixes every record with it. Blank employment statuses (required) get "Set these to": HR picks
 * the status, with nothing pre-selected, after seeing whose it is.
 */
export default function OnboardingValueFixes({ records, role, disabled, dirty, onApply, onShow, remembered = [], onForget }: {
  records: Records; role?: string | null; disabled: boolean; dirty: boolean;
  onApply: (fix: ValueFixRequest, count: number, label: string) => void;
  onShow: (field: ValueFixField) => void;
  /** This company's remembered choices: offered pre-selected, never applied by themselves. */
  remembered?: RememberedChoice[]; onForget?: (choice: { field: string; value: string }) => void;
}) {
  const groups = useMemo(() => valueFixGroups(records), [records]);
  const blankRecords = useMemo(() => blankStatusRecords(records), [records]);
  const blanks = blankRecords.length;
  const [blankStatus, setBlankStatus] = useState(""), [namesOpen, setNamesOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  if (!groups.length && !blanks) return null;

  const off = disabled || dirty;
  const byField = new Map<ValueFixField, ValueFixGroup[]>();
  for (const group of groups) byField.set(group.field, [...(byField.get(group.field) ?? []), group]);
  const total = groups.length + (blanks ? 1 : 0);

  return <section aria-label="Values to sort out" data-value-fixes className="rounded-xl border border-amber-300 bg-white px-3 py-2 shadow-sm">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="value-fixes-body"
      className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-slate-900">
      {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
      Values to sort out · {total}
      <span className="ml-1 font-normal text-slate-500 max-sm:hidden">One choice fixes every record with that value.</span>
    </button>
    <div id="value-fixes-body" hidden={!open} className="mt-2 space-y-3">
      {dirty && <p className="text-xs text-amber-800">Save or discard the open record first.</p>}
      {groups.length > 0 && <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={remember} disabled={off} onChange={event => setRemember(event.target.checked)} />
        Remember my choices for this company's next imports
      </label>}

      {blanks > 0 && <div className="rounded-lg border border-slate-200 px-3 py-2" data-blank-status>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 basis-full text-sm text-slate-700 sm:flex-1 sm:basis-auto"><strong>Employment status</strong> is blank in {plural(blanks)}
            <button type="button" onClick={() => setNamesOpen(v => !v)} aria-expanded={namesOpen} className="ml-1.5 text-xs font-medium text-purple-900 underline">{namesOpen ? "Hide names" : "Show names"}</button></p>
          <label className="sr-only" htmlFor="blank-status-choice">Set these to</label>
          <select id="blank-status-choice" value={blankStatus} disabled={off} onChange={event => setBlankStatus(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 sm:flex-none">
            <option value="">Set these to…</option>
            {Object.entries(VALUE_FIX_CHOICES.employmentStatus).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
          <button type="button" disabled={off || !blankStatus}
            onClick={() => { onApply({ field: "employmentStatus", blanks: true, to: blankStatus }, blanks, `Blank employment statuses set to ${VALUE_FIX_CHOICES.employmentStatus[blankStatus]}`); setBlankStatus(""); }}
            className="rounded-lg bg-purple-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-950 disabled:opacity-50">Apply to {blanks}</button>
        </div>
        {namesOpen && <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-slate-700" data-blank-names>
          {blankRecords.map(r => <li key={r.id}>{[r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed"}{r.employeeCode ? ` · ${r.employeeCode}` : ""}</li>)}
        </ul>}
        <p className="mt-1 text-xs text-slate-500">Check the names first: anyone who has left should get their own status on their row.</p>
      </div>}

      {[...byField.entries()].map(([field, list]) => <div key={field}>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{VALUE_FIX_FIELD_LABELS[field]}</h4>
          <button type="button" disabled={disabled} onClick={() => onShow(field)} className="text-xs font-medium text-purple-900 underline disabled:opacity-50">Show records</button>
        </div>
        {field === "beesAccessLevel" && !valueFixAllowed(field, "ADMIN", role) &&
          <p className="mt-0.5 text-xs text-slate-500">You can choose Employee. An Admin must choose anything above it.</p>}
        <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {list.map(group => {
            const id = `${group.field}:${group.key}`, saved = rememberedChoice(group, remembered);
            const picked = choice[id] ?? (saved && valueFixAllowed(field, saved.choice, role) ? saved.choice : "");
            const label = `“${group.value}” treated as ${VALUE_FIX_CHOICES[field][picked]}`;
            return <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-value-fix={id}>
              <p className="min-w-0 basis-full break-words text-sm text-slate-800 sm:flex-1 sm:basis-auto">“{group.value}” <span className="text-slate-500">· {plural(group.count)}</span>
                {saved && <span className="ml-1 text-xs text-slate-500">· remembered as {VALUE_FIX_CHOICES[field][saved.choice]}
                  {onForget && <button type="button" disabled={off} onClick={() => onForget({ field, value: saved.value })} className="ml-1 underline disabled:opacity-50">Forget</button>}</span>}</p>
              <label className="sr-only" htmlFor={`fix-${id}`}>Treat “{group.value}” as</label>
              <select id={`fix-${id}`} value={picked} disabled={off} onChange={event => setChoice(c => ({ ...c, [id]: event.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 sm:flex-none">
                <option value="">Treat as…</option>
                {Object.entries(VALUE_FIX_CHOICES[field]).map(([key, text]) =>
                  <option key={key} value={key} disabled={!valueFixAllowed(field, key, role)}>{text}{valueFixAllowed(field, key, role) ? "" : " (Admin)"}</option>)}
              </select>
              <button type="button" disabled={off || !picked}
                onClick={() => onApply({ field, from: group.value, to: picked, remember }, group.count, label)}
                className="rounded-lg bg-purple-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-950 disabled:opacity-50">Apply to {group.count}</button>
            </li>;
          })}
        </ul>
      </div>)}
    </div>
  </section>;
}
