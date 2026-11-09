"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Typing filters options; only Enter or choosing an option commits a country. */
export function CountryPicker({
  countries,
  value,
  onChange,
  disabled,
}: {
  countries: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const options = Object.entries(countries)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .filter(([code, name]) =>
      `${name} ${code}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
  useEffect(() => {
    if (open && options[active])
      document
        .getElementById(`${id}-${options[active][0]}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, query, id]);
  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  return (
    <div
      className="relative space-y-2 text-sm"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block font-medium">
          Country
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => choose("")}
          >
            Clear country
          </Button>
        )}
      </div>
      <Input
        id={id}
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && options[active] ? `${id}-${options[active][0]}` : undefined
        }
        aria-describedby={`${id}-help`}
        placeholder="Search countries…"
        value={open ? query : countries[value] || value}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setQuery("");
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((i) =>
              Math.max(
                0,
                Math.min(
                  options.length - 1,
                  i + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (options[active]) choose(options[active][0]);
          }
        }}
      />
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 max-h-64 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          id={`${id}-options`}
          role="listbox"
          aria-label="Countries"
        >
          {options.map(([code, name], i) => (
            <button
              key={code}
              id={`${id}-${code}`}
              type="button"
              role="option"
              aria-selected={code === value}
              tabIndex={-1}
              className={`block w-full rounded px-3 py-2 text-left ${active === i ? "bg-accent text-accent-foreground" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(code)}
            >
              {name}{" "}
              <span className="text-xs text-muted-foreground">{code}</span>
            </button>
          ))}
          {!options.length && (
            <p className="px-3 py-2" role="status">
              No countries match. Try another spelling.
            </p>
          )}
        </div>
      )}
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {value
          ? `Selected: ${countries[value] || value}. `
          : "No country selected. "}
        Type to search, then choose a result or press Enter. Typing alone does
        not change the selection.
      </p>
    </div>
  );
}
