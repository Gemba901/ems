"use client";
import { useEffect, useRef } from 'react';
import { EXTRA_PROFILE_FIELDS, excelColumn, type ImportedExtraField } from './onboarding-extra-fields';
import { formatDateChoice, plausibleDate, readDate } from './import-dates';

/** Dates HR can pick with one click: the single sure reading, or both day/month readings. Never applied silently. */
function dateSuggestions(value: string, target: ImportedExtraField['target']): string[] {
  const kind = target === 'dateOfBirth' ? 'birth' : 'event', today = new Date().toISOString().slice(0, 10);
  const text = value.trim();
  if (!text || (/^\d{4}-\d{2}-\d{2}$/.test(text) && plausibleDate(text, kind, today))) return [];
  const reading = readDate(text, kind, today, null);
  return 'iso' in reading ? [reading.iso] : 'candidates' in reading ? reading.candidates : [];
}

/**
 * A record's extra imported columns. Where a column goes is decided once for the
 * whole import (Imported columns), so here it is shown, not chosen. Values stay
 * editable per record, since fixing one person's date is a per-person job.
 */
export default function ImportedExtraFields({ fields, onChange, disabled = false, issues = [], registered = false, onManageColumns }: {
  fields: ImportedExtraField[]; onChange?: (fields: ImportedExtraField[]) => void;
  disabled?: boolean; issues?: string[]; registered?: boolean;
  /** Opens the import-wide column destinations; omitted where they can't be changed. */
  onManageColumns?: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const issueKey = issues.join('\n');
  useEffect(() => { if (issueKey && details.current) details.current.open = true; }, [issueKey]);
  if (!fields.length && !issues.length) return null;
  const toProfile = fields.filter(f => f.target), forReference = fields.filter(f => !f.target);
  const changeValue = (column: number, value: string) => onChange?.(fields.map(f => f.column === column ? {...f, value} : f));

  const item = (f: ImportedExtraField) => {
    const config = EXTRA_PROFILE_FIELDS.find(x => x.key === f.target);
    const source = `${excelColumn(f.column)} · ${f.heading || 'Untitled column'}`;
    const destination = config ? config.label : 'Reference only';
    const suggestions = onChange && config?.kind === 'date' ? dateSuggestions(f.value, f.target) : [];
    return <div key={f.column} data-extra-column={excelColumn(f.column)} className="space-y-1.5 py-3 first:pt-0">
      <p className="break-words text-xs font-semibold text-slate-800">
        {source} <span aria-hidden="true" className="font-normal text-slate-400">→</span>
        <span className="sr-only"> goes to </span> <span className={config ? 'text-blue-800' : 'font-normal text-slate-500'}>{destination}</span>
      </p>
      {onChange ? <label className="block text-xs text-slate-600">
        <span className="sr-only">Value for {source}</span>
        <textarea aria-label={`Value for ${source}`} rows={2} value={f.value} maxLength={4000} disabled={disabled}
          onChange={e => changeValue(f.column, e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm disabled:opacity-60" />
        {config?.kind === 'date' && <span>Use YYYY-MM-DD.</span>}
        {suggestions.length > 0 && <span className="mt-1 flex flex-wrap items-center gap-1.5" data-date-suggestions>
          <span className="text-slate-700">{suggestions.length > 1 ? 'Which date is it?' : 'Did you mean'}</span>
          {suggestions.map(iso => <button key={iso} type="button" disabled={disabled} onClick={() => changeValue(f.column, iso)}
            className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">{formatDateChoice(iso)}</button>)}
        </span>}
        {config?.kind === 'skill' && <span>Use Level 1, Level 2, Level 3 or Level 4.</span>}
        {config?.kind === 'boolean' && <span>Use Yes or No.</span>}
        {config?.kind === 'phone' && <span>The import’s default phone country applies.</span>}
      </label> : <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{f.value || '—'}</p>}
      {f.originalValue !== f.value && <p className="whitespace-pre-wrap break-words text-xs text-slate-500">From sheet: {f.originalValue || '(blank)'}</p>}
      {onChange && f.originalValue !== f.value && <button type="button" disabled={disabled} onClick={() => changeValue(f.column, f.originalValue)}
        className="text-xs text-purple-800 underline disabled:opacity-50">Restore sheet value</button>}
    </div>;
  };

  return <details ref={details} className="rounded-xl border border-slate-200 bg-white p-3" data-editor-field="extraFields" tabIndex={-1}>
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
      Additional imported information · {fields.length}
      <span className="ml-2 text-xs font-normal text-slate-500">{toProfile.length} to profile · {forReference.length} for reference</span>
    </summary>
    <p className="mt-2 text-xs text-slate-600">{registered
      ? 'Imported values are shown for reference. Profile values were copied into Master data at registration; later profile edits are shown there.'
      : 'Profile values fill the employee’s profile when registered. Reference-only values are kept with the record without affecting readiness or profile completion.'}
      {onManageColumns && !registered && <> <button type="button" disabled={disabled} onClick={onManageColumns}
        className="font-medium text-blue-700 underline underline-offset-2 disabled:opacity-50">Change where a column goes (all records)</button></>}
    </p>
    {!!issues.length && <ul role="alert" className="mt-2 space-y-1 text-xs text-red-700">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    {toProfile.length > 0 && <section className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{registered ? 'Copied to profile' : 'Goes to profile when registered'}</h4>
      <div className="mt-1 divide-y divide-slate-100">{toProfile.map(item)}</div>
    </section>}
    {forReference.length > 0 && <section className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reference only</h4>
      <div className="mt-1 divide-y divide-slate-100">{forReference.map(item)}</div>
    </section>}
  </details>;
}
