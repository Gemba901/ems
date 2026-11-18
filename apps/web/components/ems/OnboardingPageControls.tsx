"use client";
import {useEffect, useState} from 'react';
import {PAGE_SIZES} from './onboarding-pagination';
import {requestedPage} from './onboarding-editor-controls';

export default function OnboardingPageControls({location, total, page, pages, start, end, pageSize, busy, pinned, filtered, onChange}: {
  location: string; total: number; page: number; pages: number; start: number; end: number; pageSize: number;
  busy: boolean; pinned: boolean; filtered: boolean; onChange: (page: number, size?: number) => void;
}) {
  const [value, setValue] = useState(String(page));
  const [error, setError] = useState('');
  useEffect(() => { setValue(String(page)); setError(''); }, [page, pages, pageSize]);
  return <nav aria-label={`${location} record pages`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-xs">
    <span aria-live="polite">{total ? `${start + 1}–${end} of ${total}` : '0 records'}{filtered ? ' in filtered view' : ''}{pinned ? ' · open editor retained above page' : ''}</span>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Per page <select aria-label={`${location} records per page`} value={pageSize} disabled={busy}
        onChange={e => onChange(1, Number(e.target.value))} className="min-h-9 rounded border border-slate-300 bg-white px-2 py-1.5">
        {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <button type="button" disabled={busy || page === 1} onClick={() => onChange(page - 1)} className="min-h-9 rounded border border-slate-300 px-2 py-1.5 disabled:opacity-40">Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={busy || page === pages} onClick={() => onChange(page + 1)} className="min-h-9 rounded border border-slate-300 px-2 py-1.5 disabled:opacity-40">Next</button>
      <form className="flex items-center gap-1" onSubmit={event => {
        event.preventDefault(); if (busy) return;
        const next = requestedPage(value, pages);
        if (next === null) { setError(`Enter a page from 1 to ${pages}.`); return; }
        setError(''); if (next !== page) onChange(next);
      }}>
        <label htmlFor={`onboarding-page-${location}`}>Go to page</label>
        <input id={`onboarding-page-${location}`} aria-label={`${location} go to page`} inputMode="numeric" type="text" value={value} disabled={busy}
          aria-invalid={!!error} aria-describedby={error ? `onboarding-page-error-${location}` : undefined}
          onChange={event => {setValue(event.target.value); setError('');}}
          className="min-h-9 w-14 rounded border border-slate-300 px-2 py-1.5" />
        <button type="submit" disabled={busy || !total} className="min-h-9 rounded border border-purple-300 px-2 py-1.5 font-semibold text-purple-800 disabled:opacity-40">Go</button>
      </form>
      {error && <p id={`onboarding-page-error-${location}`} role="alert" className="basis-full text-right text-red-700">{error}</p>}
    </div>
  </nav>;
}
