"use client";

import React from 'react';
import { Search } from 'lucide-react';
import DwmsSelectDropdown from './DwmsSelectDropdown';

export type DwmsSearchFilterOption = {
  value: string;
  label: string;
};

export type DwmsSearchFilterConfig = {
  key: string;
  value: string;
  options: DwmsSearchFilterOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  widthClassName?: string;
};

type DwmsSearchFilterBarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: DwmsSearchFilterConfig[];
  className?: string;
};

export default function DwmsSearchFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  className = '',
}: DwmsSearchFilterBarProps) {
  return (
    <div className={`flex flex-col gap-3 md:flex-row md:items-center ${className}`}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-10.5 pr-4 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {filters.length > 0 && (
        <div className="flex w-full flex-col gap-3 md:ml-auto md:w-auto md:flex-row md:justify-end">
          {filters.map((filter) => (
            <div key={filter.key} className={`${filter.widthClassName ?? 'md:w-48'} w-full`}>
              <DwmsSelectDropdown
                value={filter.value}
                options={filter.options}
                onChange={filter.onChange}
                placeholder="Select filter"
                ariaLabel={filter.ariaLabel ?? filter.key}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
