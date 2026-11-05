"use client";

import { EXTRA_PROFILE_FIELDS, excelColumn, type ImportedExtraField } from './onboarding-extra-fields';

/** Registration evidence is retained; mapped snapshots are not live profile data. */
export default function EmployeeImportedInformation({ fields }: { fields: ImportedExtraField[] }) {
  if (!fields.length) return null;
  const extras = fields.filter(field => !field.target && field.value.trim().length > 0);
  const mapped = fields.filter(field => field.target).length;
  return <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60" data-employee-imported-information>
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700">
      {extras.length ? `Imported reference values · ${extras.length}` : 'Import source details'}
    </summary>
    <div className="space-y-4 border-t border-slate-200 px-4 py-4">
      {extras.length > 0 && <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-imported-extra-values>
        {extras.map(field => <div key={field.column} className="min-w-0">
          <dt className="text-xs font-semibold text-slate-600">{field.heading.trim() || 'Untitled field'}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{field.value}</dd>
        </div>)}
      </dl>}
      <details className="text-xs text-slate-600" data-import-source-details>
        <summary className="cursor-pointer font-medium text-purple-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700">All imported columns · {fields.length}{mapped > 0 ? ` (${mapped} copied to profile)` : ''}</summary>
        <p className="my-3 leading-relaxed">Values recorded at registration, including blank columns.
          {mapped > 0 && ' Mapped values are import history; see Master Data for the current profile values.'}</p>
        <div className="space-y-3">
          {fields.map(field => <div key={field.column} className="border-t border-slate-200 pt-3">
            <p className="font-semibold">{field.heading.trim() || 'Untitled field'} · Excel column {excelColumn(field.column)}</p>
            <dl className="mt-1 space-y-1 break-words">
              <div><dt className="inline">Original: </dt><dd className="inline whitespace-pre-wrap">{field.originalValue.trim() ? field.originalValue : '(blank)'}</dd></div>
              {field.value !== field.originalValue && <div><dt className="inline">At registration: </dt><dd className="inline whitespace-pre-wrap">{field.value.trim() ? field.value : '(blank)'}</dd></div>}
              {field.target && <div><dt className="inline">Copied to profile field: </dt><dd className="inline">{EXTRA_PROFILE_FIELDS.find(option => option.key === field.target)?.label ?? field.target}</dd></div>}
            </dl>
          </div>)}
        </div>
      </details>
    </div>
  </details>;
}
