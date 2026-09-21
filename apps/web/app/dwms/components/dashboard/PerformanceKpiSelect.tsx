'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { performanceKpis, type PerformanceKpiKey } from './performanceKpis';

type PerformanceKpiSelectProps = {
  value: PerformanceKpiKey;
  onChange: (value: PerformanceKpiKey) => void;
  ariaLabel: string;
};

export default function PerformanceKpiSelect({ value, onChange, ariaLabel }: PerformanceKpiSelectProps) {
  return (
    <Select.Root
      items={performanceKpis.map((kpi) => ({ value: kpi.key, label: kpi.label }))}
      value={value}
      onValueChange={(nextValue) => { if (nextValue) onChange(nextValue); }}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className="inline-flex min-w-52 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-text-app outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <Select.Value />
        <Select.Icon><ChevronDown className="h-4 w-4 text-slate-500" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="end" sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">
            <Select.List>
              {performanceKpis.map((kpi) => (
                <Select.Item
                  key={kpi.key}
                  value={kpi.key}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[selected]:font-semibold"
                >
                  <Select.ItemText>{kpi.label}</Select.ItemText>
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
