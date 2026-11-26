'use client';

import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import {
  getPerformanceKpiGroup,
  getPerformanceKpiGroupForMetric,
  performanceKpiGroups,
  type PerformanceKpiGroupKey,
  type PerformanceKpiKey,
} from './performanceKpis';

type PerformanceKpiSelectProps = {
  value: PerformanceKpiKey;
  onChange: (value: PerformanceKpiKey) => void;
  ariaLabel: string;
};

type Option = { value: string; label: string };

function MetricSelect({ value, options, onChange, ariaLabel, minWidth }: {
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
  minWidth: string;
}) {
  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(nextValue) => { if (nextValue) onChange(nextValue); }}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={`inline-flex ${minWidth} items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:border-border focus-visible:ring-2 focus-visible:ring-info`}
      >
        <Select.Value />
        <Select.Icon><ChevronDown className="h-4 w-4 text-muted-foreground" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner side="bottom" align="end" sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <Select.Popup className="w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg outline-none">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-info-subtle data-[highlighted]:text-info data-[selected]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator><Check className="h-4 w-4 text-info" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export default function PerformanceKpiSelect({ value, onChange, ariaLabel }: PerformanceKpiSelectProps) {
  const groupKey = getPerformanceKpiGroupForMetric(value);
  const group = getPerformanceKpiGroup(groupKey);
  const groupOptions = performanceKpiGroups.map((item) => ({ value: item.key, label: item.label }));
  const metricOptions = group.metrics.map((metric) => ({ value: metric.key, label: metric.label }));

  const selectGroup = (nextGroupKey: string) => {
    const nextGroup = getPerformanceKpiGroup(nextGroupKey as PerformanceKpiGroupKey);
    onChange(nextGroup.metrics[0].key);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MetricSelect
        value={groupKey}
        options={groupOptions}
        onChange={selectGroup}
        ariaLabel={`${ariaLabel} category`}
        minWidth="min-w-44"
      />
      <MetricSelect
        value={value}
        options={metricOptions}
        onChange={(nextValue) => onChange(nextValue as PerformanceKpiKey)}
        ariaLabel={`${ariaLabel} metric`}
        minWidth="min-w-48"
      />
    </div>
  );
}
