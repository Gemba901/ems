"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export type DwmsDropdownOption = {
  value: string;
  label: string;
  description?: string;
  imageUrl?: string | null;
  secondaryLabel?: string | null;
  variant?: 'default' | 'employee';
  exclusive?: boolean;
};

type CommonProps = {
  options: DwmsDropdownOption[];
  disabled?: boolean;
  placeholder: string;
  variant?: 'default' | 'employee';
  searchEnabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  maxSelected?: number;
  allowClear?: boolean;
  clearLabel?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
};

type SingleSelectProps = CommonProps & {
  mode?: 'single';
  value: string;
  onChange: (next: string) => void;
};

type MultiSelectProps = CommonProps & {
  mode: 'multiple';
  value: string[];
  onChange: (next: string[]) => void;
};

type Props = SingleSelectProps | MultiSelectProps;

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function DwmsSelectDropdown(props: Props) {
  const {
    options,
    disabled,
    placeholder,
    variant = 'default',
    searchEnabled,
    searchPlaceholder = 'Search by name or role',
    emptyMessage = 'No matching options found.',
    maxSelected,
    allowClear,
    clearLabel = 'Clear',
    ariaLabel,
    className,
    triggerClassName,
    contentClassName,
    onFocus,
  } = props;

  const multiple = props.mode === 'multiple';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isEmployeeSelector = variant === 'employee';
  const shouldSearch = Boolean(searchEnabled || isEmployeeSelector);
  const selectedValues = multiple ? props.value : props.value ? [props.value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const selectedOption = !multiple ? options.find((option) => option.value === props.value) : undefined;
  const selectionLimitReached = multiple && typeof maxSelected === 'number' && props.value.length >= maxSelected;
  const exclusiveValues = options
    .filter((option) => option.exclusive || option.value === 'ANYONE')
    .map((option) => option.value);

  useEffect(() => {
    if (!open) return;

    function closeDropdown() {
      setOpen(false);
      setSearch('');
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const filteredOptions = options.filter((option) => {
    if (!shouldSearch) return true;
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [option.label, option.secondaryLabel, option.description]
      .filter(Boolean)
      .some((text) => String(text).toLowerCase().includes(query));
  });

  const selectedLabel = selectedOptions.length === 0
    ? placeholder
    : selectedOptions.slice(0, 2).map((option) => option.label).join(', ') + (selectedOptions.length > 2 ? ` +${selectedOptions.length - 2}` : '');

  const toggleValue = (optionValue: string) => {
    if (disabled) return;

    if (!multiple) {
      props.onChange(optionValue);
      setOpen(false);
      setSearch('');
      return;
    }

    const selectedOption = options.find((option) => option.value === optionValue);
    if (selectedOption?.exclusive || optionValue === 'ANYONE') {
      props.onChange(props.value.length === 1 && props.value.includes(optionValue) ? [] : [optionValue]);
      return;
    }

    const next = props.value.filter((currentValue) => !exclusiveValues.includes(currentValue));
    if (next.includes(optionValue)) {
      props.onChange(next.filter((currentValue) => currentValue !== optionValue));
      return;
    }

    if (selectionLimitReached) {
      return;
    }

    props.onChange([...next, optionValue]);
  };

  const clearSelection = () => {
    if (multiple) {
      props.onChange([]);
    } else {
      props.onChange('');
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full min-w-[0]', open ? 'z-[100020]' : 'z-auto', className)}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          if (open) setSearch('');
          setOpen(!open);
        }}
        onFocus={onFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-3 border bg-white text-left text-sm text-slate-800 shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-70',
          isEmployeeSelector
            ? 'min-h-11 rounded-xl border-zinc-200 px-4 py-3 font-medium hover:border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-900/60'
            : 'h-10 rounded-full border-slate-200 px-3 py-2 hover:border-blue-200 hover:bg-slate-50 focus:ring-4 focus:ring-blue-100',
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className={`block truncate ${selectedOptions.length === 0 ? 'text-black' : 'text-slate-800'}`}>
            {selectedLabel}
          </span>
          {isEmployeeSelector && (
            <span className="mt-0.5 block truncate text-[10px] font-medium text-muted-app">
              {selectedOptions.length === 0
                ? multiple ? 'Choose one or more employees' : 'Choose an employee'
                : multiple ? `${selectedOptions.length} selected` : selectedOption?.secondaryLabel ?? selectedOption?.description ?? ''}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute left-0 right-0 z-[100030] mt-1.5 overflow-hidden border bg-white shadow-2xl animate-in fade-in slide-in-from-top-2 duration-100',
            isEmployeeSelector
              ? 'rounded-xl border-border-app p-1.5'
              : 'rounded-2xl border-slate-200 p-1.5',
            contentClassName
          )}
        >
          {shouldSearch && (
            <div className="p-1.5">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border-app bg-white px-3 py-2 text-xs font-medium text-text-app outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-app">{emptyMessage}</div>
            ) : filteredOptions.map((option) => {
              const active = selectedValues.includes(option.value);
              const optionIsEmployee = isEmployeeSelector || option.variant === 'employee';
              const atLimit = multiple && !active && selectionLimitReached && !option.exclusive && option.value !== 'ANYONE';

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  disabled={disabled || atLimit}
                  className={cn(
                    'flex w-full text-left transition',
                    optionIsEmployee
                      ? 'items-center rounded-lg px-3 py-2.5 text-xs font-semibold hover:bg-bg-app'
                      : 'items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium hover:bg-slate-50',
                    active && (optionIsEmployee ? 'bg-accent-app/10 text-accent-app' : 'bg-blue-50 text-blue-700'),
                    !active && (optionIsEmployee ? 'text-text-app' : 'text-slate-700'),
                    atLimit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  )}
                >
                  {optionIsEmployee && (
                    <Avatar size="default" className="mr-3 h-7 w-7 border">
                      <AvatarImage src={option.imageUrl ?? undefined} alt={option.label} />
                      <AvatarFallback className="bg-indigo-500/10 text-[10px] font-bold text-indigo-500">
                        {getInitials(option.label)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate', optionIsEmployee ? 'font-semibold' : 'font-medium')}>
                      {option.label}
                    </span>
                    {(option.secondaryLabel || option.description) && (
                      <span className={cn('mt-0.5 block truncate', optionIsEmployee ? 'text-[10px] font-medium opacity-60' : 'text-xs text-slate-400')}>
                        {option.secondaryLabel}
                        {option.secondaryLabel && option.description ? ' - ' : ''}
                        {option.description}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center justify-center border',
                      optionIsEmployee ? 'ml-3 h-5 w-5 rounded-md' : 'mt-0.5 h-4 w-4 rounded-full',
                      active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-white'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>

          {(multiple || allowClear) && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
              <span>{multiple && typeof maxSelected === 'number' ? `Up to ${maxSelected} selections` : `${selectedOptions.length} selected`}</span>
              <button
                type="button"
                onClick={clearSelection}
                disabled={disabled || selectedValues.length === 0}
                className="font-semibold text-slate-700 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clearLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
