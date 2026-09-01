"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface FilterBarSelect {
  key: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  tooltip?: string;
}

interface Props {
  search: { value: string; onChange: (v: string) => void; placeholder?: string; tooltip?: string };
  selects: FilterBarSelect[];
  active: boolean;
  onClear: () => void;
  /** Extra process-specific filter UI (e.g. P01's date range/advanced panel toggle, P04's plan select) rendered after the standard selects. */
  extra?: React.ReactNode;
}

export const filterSelectClass = "h-9 rounded-lg border border-input bg-transparent px-3 text-sm";

/**
 * Canonical search/filter shell for P01-P06 list pages — replaces 6
 * near-identical per-process copies (same layout, each redefining its own
 * `selectClass` string). Every filter still drives the same real backend
 * query params as before; this component only standardizes spacing/
 * typography/tooltip treatment and the "Clear filters" affordance.
 * Process-specific extras (P01's date range, P04's plan dropdown) are
 * composed in via `extra`, not flattened away.
 */
export function FilterBar({ search, selects, active, onClear, extra }: Props) {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={(triggerProps) => (
              <div {...triggerProps} className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={search.placeholder ?? "Search..."}
                  className="pl-9"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                />
              </div>
            )}
          />
          {search.tooltip && <TooltipContent>{search.tooltip}</TooltipContent>}
        </Tooltip>

        {selects.map((s) =>
          s.tooltip ? (
            <Tooltip key={s.key}>
              <TooltipTrigger
                render={(triggerProps) => (
                  <select {...triggerProps} className={filterSelectClass} value={s.value} onChange={(e) => s.onChange(e.target.value)}>
                    <option value="">{s.placeholder}</option>
                    {s.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
              />
              <TooltipContent>{s.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <select key={s.key} className={filterSelectClass} value={s.value} onChange={(e) => s.onChange(e.target.value)}>
              <option value="">{s.placeholder}</option>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ),
        )}

        {extra}

        {active && (
          <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}
