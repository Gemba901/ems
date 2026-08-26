"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * Searchable master-data select. Queries `queryKey`/`fetchOptions` on open
 * (debounced by react-query's own caching, not a manual debounce — lookups
 * are cheap `take: 50` reads) and lets the user pick from what the system
 * already knows instead of free-typing it.
 */
export function MasterDataCombobox({
  value,
  onChange,
  queryKey,
  fetchOptions,
  placeholder = "Search...",
  emptyLabel = "No matches found.",
  disabled,
}: {
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption) => void;
  queryKey: unknown[];
  fetchOptions: (search: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: options, isFetching } = useQuery({
    queryKey: [...queryKey, search],
    queryFn: () => fetchOptions(search),
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const list = useMemo(() => options ?? [], [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
      >
        <span className={value ? "text-slate-800 truncate" : "text-slate-400 truncate"}>
          {value ? value.label : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1.5" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type to search..."
            className="h-6 border-0 shadow-none px-0 focus-visible:ring-0"
          />
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />}
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {list.length === 0 && !isFetching && (
            <p className="px-3 py-3 text-xs text-slate-400 text-center">{emptyLabel}</p>
          )}
          {list.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setSearch("");
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 rounded-md"
            >
              <span className="min-w-0">
                <span className="block text-slate-800 truncate">{opt.label}</span>
                {opt.description && (
                  <span className="block text-xs text-slate-400 truncate">{opt.description}</span>
                )}
              </span>
              {value?.value === opt.value && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
