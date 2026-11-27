"use client";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./chart-v3.module.css";

export function GroupPicker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const id = useId();
  const shown = options.filter((o) =>
    o.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={picker}
      className={styles.groupPicker}
      onBlur={(e) => {
        // Clicking label text can briefly clear focus before the browser activates
        // its checkbox. Only a known outside focus target should close here.
        if (
          e.relatedTarget &&
          !e.currentTarget.contains(e.relatedTarget as Node)
        )
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={button}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={`${id}-value`}>
          {selected.length ? `${selected.length} selected` : "All departments"}
        </span>{" "}
        ▾
      </button>
      {open && (
        <div
          id={`${id}-options`}
          className={styles.groupOptions}
          role="group"
          aria-label={label}
        >
          <label>
            Search{" "}
            {label.toLowerCase().includes("branch")
              ? "branches"
              : "departments"}
            <input
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className={styles.buttonRow}>
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => {
                onChange([]);
                setOpen(false);
                button.current?.focus();
              }}
            >
              All departments
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              Done
            </button>
          </div>
          <div className={styles.groupChecks}>
            {shown.map((o) => (
              <label key={o.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, o.id]
                        : selected.filter((id) => id !== o.id),
                    )
                  }
                />
                {o.name}
              </label>
            ))}
            {!shown.length && <p>No matching groups.</p>}
          </div>
        </div>
      )}
      {!!selected.length && (
        <div
          className={styles.chips}
          aria-label={`Selected ${label.toLowerCase()}`}
        >
          {selected.map((key) => (
            <button
              type="button"
              key={key}
              aria-label={`Remove ${options.find((o) => o.id === key)?.name || key}`}
              onClick={() => onChange(selected.filter((id) => id !== key))}
            >
              {options.find((o) => o.id === key)?.name || "Unavailable group"} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
