"use client";
import { useEffect, useRef } from 'react';
import { EXTRA_PROFILE_FIELDS, excelColumn, type ImportedExtraField } from './onboarding-extra-fields';
import { formatDateChoice, plausibleDate, readDate } from './import-dates';
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
 * A finding naming a column shows under that column's value; other findings stay at the top.
 */
export default function ImportedExtraFields({ fields, onChange, disabled = false, issues = [], warnings = [], registered = false, onManageColumns }: {
  fields: ImportedExtraField[]; onChange?: (fields: ImportedExtraField[]) => void;
  disabled?: boolean; issues?: string[]; registered?: boolean;
  /** Values that can't be used but don't block registration: the profile field is left empty. */
  warnings?: string[];
  /** Opens the import-wide column destinations; omitted where they can't be changed. */
  onManageColumns?: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const issueKey = [...issues, ...warnings].join('\n');
  useEffect(() => { if (issueKey && details.current) details.current.open = true; }, [issueKey]);
  if (!fields.length && !issues.length && !warnings.length) return null;
  const toProfile = fields.filter(f => f.target), forReference = fields.filter(f => !f.target);
  const changeValue = (column: number, value: string) => onChange?.(fields.map(f => f.column === column ? {...f, value} : f));
  // Findings naming a column ("… (column AG): …") go under that column's value; the rest stay at the top.
  const columnOf = (finding: string) => /\(column ([A-Z]{1,3})\)/.exec(finding)?.[1];
  const shown = new Set(fields.map(f => excelColumn(f.column)));
  const general = issues.filter(issue => !shown.has(columnOf(issue) ?? ''));
  const generalWarnings = warnings.filter(warning => !shown.has(columnOf(warning) ?? ''));

  const item = (f: ImportedExtraField) => {
    const config = EXTRA_PROFILE_FIELDS.find(x => x.key === f.target);
    const source = `${excelColumn(f.column)} · ${f.heading || 'Untitled column'}`;
    const destination = config ? config.label : 'Reference only';
    const own = issues.filter(issue => columnOf(issue) === excelColumn(f.column));
    const ownWarnings = warnings.filter(warning => columnOf(warning) === excelColumn(f.column));
    const suggestions = onChange && config?.kind === 'date' ? dateSuggestions(f.value, f.target) : [];
    return <div key={f.column} data-extra-column={excelColumn(f.column)} className="space-y-1.5 py-3 first:pt-0">
      <p className="break-words text-xs font-semibold text-foreground">
        {source} <span aria-hidden="true" className="font-normal text-muted-foreground">→</span>
        <span className="sr-only"> goes to </span> <span className={config ? 'text-info' : 'font-normal text-muted-foreground'}>{destination}</span>
      </p>
      {onChange ? <label className="block text-xs text-muted-foreground">
        <span className="sr-only">Value for {source}</span>
        <Textarea aria-label={`Value for ${source}`} rows={2} value={f.value} maxLength={4000} disabled={disabled}
          onChange={e => changeValue(f.column, e.target.value)}
          aria-invalid={own.length > 0 || undefined}
          className={`w-full rounded-lg border p-2 text-sm disabled:opacity-60 ${own.length ? 'border-danger/50' : ownWarnings.length ? 'border-warning/50' : 'border-border'}`} />
        {config?.kind === 'date' && <span>Use YYYY-MM-DD.</span>}
        {suggestions.length > 0 && <span className="mt-1 flex flex-wrap items-center gap-1.5" data-date-suggestions>
          <span className="text-foreground">{suggestions.length > 1 ? 'Which date is it?' : 'Did you mean'}</span>
          {suggestions.map(iso => <Button variant="ghost" key={iso} type="button" disabled={disabled} onClick={() => changeValue(f.column, iso)}
            className="rounded-full border border-info/30 bg-info-subtle px-2 py-0.5 font-semibold text-info hover:bg-info-subtle disabled:opacity-50 h-auto whitespace-normal">{formatDateChoice(iso)}</Button>)}
        </span>}
        {config?.kind === 'skill' && <span>Use Level 1, Level 2, Level 3 or Level 4.</span>}
        {config?.kind === 'boolean' && <span>Use Yes or No.</span>}
        {config?.kind === 'phone' && <span>The import’s default phone country applies.</span>}
      </label> : <p className="whitespace-pre-wrap break-words text-sm text-foreground">{f.value || '—'}</p>}
      {f.originalValue !== f.value && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">From sheet: {f.originalValue || '(blank)'}</p>}
      {onChange && f.originalValue !== f.value && <Button variant="ghost" type="button" disabled={disabled} onClick={() => changeValue(f.column, f.originalValue)}
        className="text-xs text-primary underline disabled:opacity-50 h-auto whitespace-normal">Restore sheet value</Button>}
      {own.length > 0 && <ul role="alert" className="space-y-1 text-xs text-danger">{own.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      {ownWarnings.length > 0 && <ul className="space-y-1 text-xs text-warning" data-extra-warning>{ownWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    </div>;
  };

  return <details ref={details} className="rounded-xl border border-border bg-card p-3" data-editor-field="extraFields" tabIndex={-1}>
    <summary className="cursor-pointer text-sm font-semibold text-foreground">
      Additional imported information · {fields.length}
      <span className="ml-2 text-xs font-normal text-muted-foreground">{toProfile.length} to profile · {forReference.length} for reference</span>
    </summary>
    <p className="mt-2 text-xs text-muted-foreground">{registered
      ? 'Imported values are shown for reference. Profile values were copied into Master data at registration; later profile edits are shown there.'
      : 'Profile values fill the employee’s profile when registered. Reference-only values are kept with the record without affecting readiness or profile completion.'}
      {onManageColumns && !registered && <> <Button variant="ghost" type="button" disabled={disabled} onClick={onManageColumns}
        className="font-medium text-info underline underline-offset-2 disabled:opacity-50 h-auto whitespace-normal">Change where a column goes (all records)</Button></>}
    </p>
    {!!general.length && <ul role="alert" className="mt-2 space-y-1 text-xs text-danger">{general.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    {!!generalWarnings.length && <ul className="mt-2 space-y-1 text-xs text-warning">{generalWarnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {toProfile.length > 0 && <section className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{registered ? 'Copied to profile' : 'Goes to profile when registered'}</h4>
      <div className="mt-1 divide-y divide-border">{toProfile.map(item)}</div>
    </section>}
    {forReference.length > 0 && <section className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reference only</h4>
      <div className="mt-1 divide-y divide-border">{forReference.map(item)}</div>
    </section>}
  </details>;
}
