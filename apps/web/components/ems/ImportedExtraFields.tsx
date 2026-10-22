"use client";
import { useEffect, useRef } from 'react';
import { EXTRA_PROFILE_FIELDS, excelColumn, type ImportedExtraField, type ExtraProfileField } from './onboarding-extra-fields';

export default function ImportedExtraFields({ fields, onChange, disabled = false, issues = [], registered = false }: {
  fields: ImportedExtraField[]; onChange?: (fields: ImportedExtraField[]) => void;
  disabled?: boolean; issues?: string[]; registered?: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const issueKey = issues.join('\n');
  useEffect(() => { if (issueKey && details.current) details.current.open = true; }, [issueKey]);
  if (!fields.length && !issues.length) return null;
  const mapped = fields.filter(f => f.target).length;
  const change = (column: number, patch: Partial<Pick<ImportedExtraField, 'target' | 'value'>>) =>
    onChange?.(fields.map(f => f.column === column ? {...f, ...patch} : f));
  return <details ref={details} className="rounded-xl border border-slate-200 bg-white p-3" data-editor-field="extraFields" tabIndex={-1}>
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
      Additional imported information · {fields.length}
      <span className="ml-2 text-xs font-normal text-slate-500">{mapped} mapped · {fields.length - mapped} kept as extra</span>
    </summary>
    <p className="mt-2 text-xs text-slate-600">{registered
      ? 'Imported values are shown for reference. Mapped values were copied into Master data at registration; later profile edits are shown there.'
      : 'Mapped values fill existing profile fields when registered. Keep as extra information preserves the value without affecting readiness or profile completion.'}</p>
    {!!issues.length && <ul role="alert" className="mt-2 space-y-1 text-xs text-red-700">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    <div className="mt-3 divide-y divide-slate-100">
      {fields.map(f => {
        const config = EXTRA_PROFILE_FIELDS.find(x => x.key === f.target);
        const title = `${excelColumn(f.column)} · ${f.heading || 'Untitled column'}`;
        return <div key={f.column} className="space-y-2 py-3 first:pt-0">
          <p className="break-words text-xs font-semibold text-slate-800">{title}</p>
          {onChange ? <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-600">Use this value for
              <select aria-label={`Map ${title}`} value={f.target ?? ''} disabled={disabled}
                onChange={e => change(f.column, {target: (e.target.value || null) as ExtraProfileField | null})}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:opacity-60">
                <option value="">Keep as extra information</option>
                {EXTRA_PROFILE_FIELDS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">Value
              <textarea aria-label={`Value for ${title}`} rows={2} value={f.value} maxLength={4000} disabled={disabled}
                onChange={e => change(f.column, {value: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm disabled:opacity-60" />
              {config?.kind === 'date' && <span>Use YYYY-MM-DD.</span>}
              {config?.kind === 'skill' && <span>Use Level 1, Level 2, Level 3 or Level 4.</span>}
              {config?.kind === 'boolean' && <span>Use Yes or No.</span>}
              {config?.kind === 'phone' && <span>The import’s default phone country applies.</span>}
            </label>
          </div> : <div className="text-sm text-slate-700"><p className="whitespace-pre-wrap break-words">{f.value || '—'}</p>
            <p className="mt-1 text-xs text-slate-500">{config ? `${registered ? 'Mapped at registration' : 'Maps to'}: ${config.label}` : 'Kept as extra information'}</p></div>}
          {f.originalValue !== f.value && <p className="whitespace-pre-wrap break-words text-xs text-slate-500">From sheet: {f.originalValue || '(blank)'}</p>}
          {onChange && f.originalValue !== f.value && <button type="button" disabled={disabled} onClick={() => change(f.column, {value: f.originalValue})}
            className="text-xs text-purple-800 underline disabled:opacity-50">Restore sheet value</button>}
        </div>;
      })}
    </div>
  </details>;
}
