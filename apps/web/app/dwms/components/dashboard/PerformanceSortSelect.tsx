'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { PerformanceSortDirection } from './performanceKpis';

const sortOptions = [
  { value: 'desc', label: 'Highest to smallest' },
  { value: 'asc', label: 'Smallest to highest' },
] as const;

type PerformanceSortSelectProps = {
  value: PerformanceSortDirection;
  onChange: (value: PerformanceSortDirection) => void;
  ariaLabel: string;
};

export default function PerformanceSortSelect({ value, onChange, ariaLabel }: PerformanceSortSelectProps) {
  return (
    <Select.Root
      items={sortOptions}
      value={value}
      onValueChange={(nextValue) => { if (nextValue) onChange(nextValue); }}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className="inline-flex min-w-44 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-text-app outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <Select.Value />
        <Select.Icon><ChevronDown className="h-4 w-4 text-slate-500" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="end" sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <Select.List>
              {sortOptions.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[selected]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator><Check className="h-4 w-4 text-blue-600" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
