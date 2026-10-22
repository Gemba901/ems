"use client";

import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';

export type WorkFieldOption = { value: string; detail?: string; disabled?: boolean; preferred?: boolean };
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string; label: string; options: WorkFieldOption[]; onChangeValue: (value: string) => void;
};
const key = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

/** Editable suggestions: typing never chooses a different value or submits a save. */
export default function OnboardingWorkField({ value, label, options, onChangeValue, ...inputProps }: Props) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const needle = key(query);
    return options.filter(option => !needle || key(option.value).includes(needle)).sort((a, b) =>
      Number(!!b.preferred) - Number(!!a.preferred) || Number(key(b.value).startsWith(needle)) - Number(key(a.value).startsWith(needle))
      || a.value.localeCompare(b.value, 'en'));
  }, [options, query]);
  const shown = matches.slice(0, 40), enabled = shown.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0);
  const listId = `${inputProps.id}-choices`, isOpen = open && !inputProps.disabled;
  useEffect(() => { setActive(-1); }, [query, options]);
  useEffect(() => { if (inputProps.disabled) setOpen(false); }, [inputProps.disabled]);
  useEffect(() => {
    const menu = list.current, option = menu?.children[active] as HTMLElement | undefined;
    if (!menu || !option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight)
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [active]);
  function choose(index: number) {
    const option = shown[index];
    if (!option || option.disabled || inputProps.disabled) return;
    onChangeValue(option.value); input.current?.focus({preventScroll: true});
    setOpen(false); setQuery(''); setActive(-1);
  }
  return <div className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <div className="flex items-stretch gap-1">
      <input {...inputProps} ref={input} type="text" value={value} role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => { if (!open) { setQuery(''); setActive(-1); setOpen(true); } }}
        onChange={event => { onChangeValue(event.target.value); setQuery(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { if (isOpen) event.stopPropagation(); setOpen(false); setActive(-1); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            const position = enabled.indexOf(active), direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive(enabled.length ? enabled[(position < 0 ? (direction === 1 ? 0 : enabled.length - 1) : (position + direction + enabled.length) % enabled.length)] : -1);
          }
          if (event.key === 'Enter' && isOpen && active >= 0) { event.preventDefault(); choose(active); }
        }} />
      <button type="button" disabled={inputProps.disabled} aria-label={`Browse ${label.toLowerCase()} choices`}
        aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined}
        onClick={() => { setQuery(''); setActive(-1); setOpen(!isOpen); }}
        className="mt-1 shrink-0 rounded-lg border border-slate-200 px-2 text-slate-600 disabled:bg-slate-100 focus-visible:outline-2 focus-visible:outline-violet-700">▾</button>
    </div>
    {isOpen && <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
      <div ref={list} role="listbox" id={listId} aria-label={`${label} choices`} className="max-h-56 overflow-y-auto overscroll-contain">
        {shown.map((option, index) => <button type="button" role="option" id={`${listId}-${index}`} key={option.value}
          aria-selected={active === index} aria-disabled={option.disabled || undefined} disabled={option.disabled} tabIndex={-1}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}
          className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm disabled:text-slate-400 ${active === index ? 'bg-violet-100' : 'hover:bg-violet-50'}`}>
          <span className="block break-words font-medium">{option.value}</span>
          {option.detail && <span className="block text-xs">{option.detail}</span>}
        </button>)}
      </div>
      <p role="status" className="px-3 py-2 text-xs text-slate-600">
        {!matches.length ? `No matching ${label.toLowerCase()} choices.` : matches.length > shown.length ? `Showing ${shown.length} of ${matches.length}. Type more to narrow the list.` : `${matches.length} choice${matches.length === 1 ? '' : 's'}.`}
      </p>
    </div>}
  </div>;
}
