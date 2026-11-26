"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  descriptionDisplay?: 'inline' | 'tooltip';
  showTriggerDescription?: boolean;
  selectionSummary?: 'default' | 'first-with-count';
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
    descriptionDisplay = 'inline',
    showTriggerDescription = true,
    selectionSummary = 'default',
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
    : selectionSummary === 'first-with-count'
      ? `${selectedOptions[0].label}${selectedOptions.length > 1 ? ` +${selectedOptions.length - 1}` : ''}`
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
    <div
      ref={containerRef}
      className={cn(
        'relative w-full min-w-0',
        open ? 'z-[100020]' : 'z-auto',
        className
      )}
    >
      <Button
        variant="ghost"
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
          'flex w-full items-center justify-between gap-3 border bg-card text-left text-sm text-foreground shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-70',
          isEmployeeSelector
            ? 'min-h-11 min-w-0 rounded-xl border-border bg-card px-4 py-3 font-medium hover:border-info focus:border-info focus:ring-1 focus:ring-info/20'
            : 'min-h-11 min-w-0 rounded-xl border-border px-3 py-2 hover:border-info hover:bg-muted focus:ring-4 focus:ring-info sm:rounded-full',
          triggerClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <span className={`block truncate ${selectedOptions.length === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
            {selectedLabel}
          </span>
          {isEmployeeSelector && showTriggerDescription && (
            <span className="mt-0.5 block truncate text-[10px] font-medium text-muted-foreground">
              {selectedOptions.length === 0
                ? multiple ? 'Choose one or more employees' : 'Choose an employee'
                : multiple ? `${selectedOptions.length} selected` : selectedOption?.secondaryLabel ?? selectedOption?.description ?? ''}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          className={cn(
            'absolute left-0 right-0 z-[100030] mt-1.5 w-full max-w-[calc(100vw-2rem)] overflow-hidden border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 duration-100 sm:w-auto sm:min-w-full',
            isEmployeeSelector
              ? 'min-w-full rounded-xl border-border p-1.5'
              : 'min-w-full rounded-2xl border-border p-1.5',
            contentClassName
          )}
        >
          {shouldSearch && (
            <div className="p-1.5">
              <Input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-none transition focus:border-info focus:ring-1 focus:ring-info/20"
              />
            </div>
          )}

          <TooltipProvider>
          <div className={cn('max-h-72 overflow-y-auto', descriptionDisplay === 'tooltip' && 'space-y-1')}>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">{emptyMessage}</div>
            ) : filteredOptions.map((option) => {
              const active = selectedValues.includes(option.value);
              const optionIsEmployee = isEmployeeSelector || option.variant === 'employee';
              const atLimit = multiple && !active && selectionLimitReached && !option.exclusive && option.value !== 'ANYONE';

              if (descriptionDisplay === 'tooltip' && option.description && !optionIsEmployee) {
                return (
                  <Tooltip key={option.value}>
                    <TooltipTrigger
                      render={(triggerProps) => (
                        <Button
                          variant="ghost"
                          {...triggerProps}
                          type="button"
                          onClick={() => toggleValue(option.value)}
                          disabled={disabled || atLimit}
                          className={cn(
                            'flex h-auto w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition',
                            active ? 'bg-info-subtle text-info' : 'text-foreground hover:bg-muted',
                            atLimit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          )}
                        >
                          <span className="min-w-0 flex-1 whitespace-normal break-words">
                            {option.label}
                          </span>
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                              active ? 'border-info bg-info text-info-foreground' : 'border-border bg-card text-primary-foreground'
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </Button>
                      )}
                    />
                    <TooltipContent
                      side="top"
                      positionerClassName="z-[100100]"
                      className="max-w-72 border border-border bg-card px-3 py-2 leading-5 text-foreground shadow-xl"
                    >
                      {option.description}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Button
                  variant="ghost"
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  disabled={disabled || atLimit}
                  className={cn(
                    'flex w-full text-left transition',
                    optionIsEmployee
                      ? 'items-center rounded-lg px-3 py-2.5 text-xs font-semibold hover:bg-muted'
                      : 'items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium hover:bg-muted',
                    active && (optionIsEmployee ? 'bg-accent-app/10 text-primary' : 'bg-info-subtle text-info'),
                    !active && (optionIsEmployee ? 'text-foreground' : 'text-foreground'),
                    atLimit ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  )}
                >
                  {optionIsEmployee && (
                    <Avatar size="default" className="mr-3 h-7 w-7 border">
                      <AvatarImage src={option.imageUrl ?? undefined} alt={option.label} />
                      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                        {getInitials(option.label)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="min-w-0 flex-1 pr-2">
                    <span className={cn('block truncate', optionIsEmployee ? 'font-semibold' : 'font-medium')}>
                      {option.label}
                    </span>
                    {(option.secondaryLabel || option.description) && (
                      <span
                        className={cn(
                          'mt-0.5 block whitespace-normal break-words leading-4',
                          optionIsEmployee ? 'text-[10px] font-medium opacity-60' : 'text-xs text-muted-foreground'
                        )}
                      >
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
                      active ? 'border-info bg-info text-info-foreground' : 'border-border bg-card text-primary-foreground'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </Button>
              );
            })}
          </div>
          </TooltipProvider>

          {(multiple || allowClear) && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              <span>{multiple && typeof maxSelected === 'number' ? `Up to ${maxSelected} selections` : `${selectedOptions.length} selected`}</span>
              <Button
                variant="ghost"
                type="button"
                onClick={clearSelection}
                disabled={disabled || selectedValues.length === 0}
                className="font-semibold text-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clearLabel}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
