"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SearchableOption = {
  value: string;
  label: string;
  hint?: string;        // shown faint on the right, e.g. "+254"
  aside?: string;       // shown in brackets after the label, e.g. "USA"
  keywords?: string[];  // extra search terms, e.g. ["US", "USA", "America"]
};

/** Lower-case and strip accents, so "cote" finds "Côte d'Ivoire". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * A text box with a styled, searchable list underneath.
 * Clicking shows the whole list; typing filters it (matching anywhere in the name).
 * The parent owns the text, so it can prefill it and validate what was typed.
 */
export default function SearchableSelect({
  id, options, value, text, onTextChange, placeholder, disabled = false, invalid = false, describedBy,
  widthClass = "max-w-md",
}: {
  id: string;
  options: SearchableOption[];
  value: string;                         // the chosen option's value, or "" if none
  text: string;                          // what the box shows
  onTextChange: (text: string) => void;  // typing, or picking an option (sends its label)
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  widthClass?: string;                   // keeps the box a sensible width on wide screens
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);   // has the user typed since opening?
  const [active, setActive] = useState(0);     // highlighted row for the keyboard
  const listRef = useRef<HTMLUListElement>(null);

  // Until the user types, show everything. After that, rank the matches:
  // an exact keyword ("us", "uk") first, then names starting with the text, then names containing it.
  const shown = useMemo(() => {
    if (!typed || !text.trim()) return options;
    const q = fold(text);
    const rank = (o: SearchableOption) => {
      const words = [o.aside, ...(o.keywords ?? [])].filter(Boolean).map((w) => fold(w!));
      if (words.includes(q)) return 0;
      if (fold(o.label).startsWith(q)) return 1;
      if (fold(o.label).includes(q) || words.some((w) => w.startsWith(q))) return 2;
      return -1;
    };
    return options
      .map((o) => ({ o, r: rank(o) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.o);
  }, [options, text, typed]);

  function openList() {
    setOpen(true);
    setTyped(false);
    const current = options.findIndex((o) => o.value === value);
    setActive(current >= 0 ? current : 0);
  }

  function choose(option: SearchableOption) {
    onTextChange(option.label);
    setOpen(false);
  }

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={`relative mt-1 ${widthClass}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(e) => { e.target.select(); openList(); }}          // select all, so typing replaces it
        onClick={() => { if (!open) openList(); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onTextChange(e.target.value); setTyped(true); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(i + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); choose(shown[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={`w-full pl-3 pr-9 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 ${
          invalid ? "border-red-400 focus:ring-red-300" : "border-slate-200 focus:ring-blue-500/20"
        }`}
      />
      {/* The arrow opens and closes the list. mousedown + preventDefault keeps focus in the box. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close list" : "Open list"}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else { document.getElementById(id)?.focus(); openList(); }
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No country matches “{text.trim()}”</li>
          ) : (
            shown.map((option, i) => (
              <li
                key={option.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={option.value === value}
                // mousedown + preventDefault keeps focus in the box, so the blur doesn't close the list first.
                onMouseDown={(e) => { e.preventDefault(); choose(option); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                  i === active ? "bg-blue-50 text-slate-900" : "text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Check className={`h-3.5 w-3.5 ${option.value === value ? "text-blue-600" : "invisible"}`} />
                  {option.label}
                  {option.aside && <span className="text-slate-400">({option.aside})</span>}
                </span>
                {option.hint && <span className="text-xs text-slate-400">{option.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
