'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

type PerformanceScoreboardSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function PerformanceScoreboardSearch({
  value,
  onChange,
}: PerformanceScoreboardSearchProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-text-app transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <Search className="h-4 w-4 text-slate-500" />
        Search person
      </button>
    );
  }

  return (
    <div className="flex min-w-56 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-blue-200">
      <Search className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        autoFocus
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name or role"
        aria-label="Search scoreboard by employee name or role"
        className="min-w-0 flex-1 bg-transparent text-sm text-text-app outline-none placeholder:text-slate-400"
      />
      <button
        type="button"
        aria-label="Close scoreboard search"
        onClick={() => {
          onChange('');
          setOpen(false);
        }}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
