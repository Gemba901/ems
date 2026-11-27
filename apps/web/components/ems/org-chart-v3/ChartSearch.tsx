"use client";
import { useMemo, useRef, useState } from "react";
import { branchName, searchPeople, type Person } from "./model";
import styles from "./chart-v3.module.css";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ChartSearch({
  people,
  value,
  onChange,
  onPick,
  onApply,
  selectedName,
}: {
  people: Person[];
  value: string;
  onChange: (value: string) => void;
  onPick: (id: string) => void;
  onApply: () => void;
  selectedName?: string;
}) {
  const [shown, setShown] = useState(false);
  const suppressFocus = useRef(false);
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => searchPeople(people, value), [people, value]);
  return (
    <form
      role="search"
      className={styles.search}
      onSubmit={(e) => {
        e.preventDefault();
        setShown(false);
        onApply();
      }}
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)
        )
          setShown(false);
      }}
    >
      <label htmlFor="chart-v3-search">Find people</label>
      <div className={styles.searchRow}>
        <Input
          ref={input}
          id="chart-v3-search"
          type="search"
          autoComplete="off"
          value={value}
          placeholder="Name, job title or department"
          aria-controls={shown ? "chart-v3-results" : undefined}
          onFocus={() => {
            if (suppressFocus.current) {
              suppressFocus.current = false;
              return;
            }
            setShown(true);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setShown(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setShown(false);
              e.stopPropagation();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setShown(true);
              requestAnimationFrame(() =>
                list.current
                  ?.querySelector<HTMLButtonElement>("button")
                  ?.focus(),
              );
            }
          }}
        />
        <Button variant="ghost"
          type="submit"
          disabled={!value.trim()}
          className={`${styles.primary} h-auto whitespace-normal`}
        >
          Show {value.trim() ? matches.length : "all"} matches
        </Button>
      </div>
      <p className={styles.hint}>
        {selectedName
          ? `Selected: ${selectedName}. Edit the text to search again.`
          : "Pick a person to focus on them. Press Enter or Show matches to show everyone matching your text within the current filters."}
      </p>
      {shown && value.trim() && (
        <div className={styles.suggestions}>
          <p className={styles.suggestionCount}>
            {matches.length} matches in this view
          </p>
          <ul
            ref={list}
            id="chart-v3-results"
            aria-label="Matching people"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShown(false);
                suppressFocus.current = true;
                input.current?.focus();
                e.preventDefault();
                e.stopPropagation();
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                return;
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              );
              const at = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          buttons.length - 1,
                          at + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      );
              e.preventDefault();
              buttons[next]?.focus();
              buttons[next]?.scrollIntoView({ block: "nearest" });
            }}
          >
            {!matches.length && (
              <li className={styles.empty}>No matching people.</li>
            )}
            {matches.map((p) => (
              <li key={p.id}>
                <Button variant="ghost"
                  type="button"
                  onClick={() => {
                    onPick(p.id);
                    setShown(false);
                  }}
                >
                  <strong>{p.name}</strong>{" "}
                  <span>
                    {[p.jobTitle, p.department?.name, branchName(p)]
                      .filter(Boolean)
                      .join(" · ") || "No work details recorded"}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
