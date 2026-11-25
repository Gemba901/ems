"use client";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { branchName, type Person } from "./model";
import styles from "./chart-v3.module.css";

export function OpenTeams({
  teams,
  onLocate,
}: {
  teams: { person: Person; shownReports: number }[];
  onLocate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const [position, setPosition] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (focus = false) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const safeTop = trigger.current?.closest('[data-expanded="true"]')
        ? 12
        : 88;
      const height = window.innerHeight,
        width = Math.min(480, window.innerWidth - 24);
      const top = Math.max(safeTop, Math.min(rect.bottom + 8, height - 260));
      setPosition({
        top,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
        maxHeight: Math.min(440, height - top - 12),
      });
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const scroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !panel.current?.contains(event.target)
      )
        close();
    };
    place();
    panel.current
      ?.querySelector<HTMLInputElement>("input")
      ?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const term = query.trim().toLocaleLowerCase();
  const shown = teams.filter(({ person: p }) =>
    [p.name, p.employeeCode, p.jobTitle, p.department?.name, branchName(p)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <div
      ref={root}
      className={styles.openTeams}
      onBlur={(e) => {
        if (
          e.relatedTarget &&
          !e.currentTarget.contains(e.relatedTarget as Node)
        )
          close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setQuery("");
          setOpen((value) => !value);
        }}
      >
        Open teams ({teams.length}) ▾
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="region"
          aria-label="Open teams"
          className={styles.openTeamsPanel}
          style={position}
        >
          <div className={styles.sectionHeading}>
            <strong>Teams currently open</strong>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="Close open teams"
            >
              ×
            </button>
          </div>
          <p>
            Managers whose direct reports are shown, including teams opened by
            search.
          </p>
          {teams.length > 0 && (
            <label>
              Find an open team
              <input
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}
          <ul aria-label="Open team managers">
            {shown.map(({ person: p, shownReports }) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}’s team</strong>
                  {p.employeeCode && (
                    <span>Employee code: {p.employeeCode}</span>
                  )}
                  <span>
                    Department: {p.department?.name || "Not recorded"}
                  </span>
                  <span>Branch / site: {branchName(p) || "Not recorded"}</span>
                  <span>
                    {shownReports} direct{" "}
                    {shownReports === 1 ? "report" : "reports"} shown
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Locate ${p.name}’s team`}
                  onClick={() => {
                    close(true);
                    onLocate(p.id);
                  }}
                >
                  Locate
                </button>
              </li>
            ))}
            {!shown.length && (
              <li>
                {teams.length
                  ? "No open teams match that search."
                  : "No teams are open. Open a manager’s team or use Show all & fit."}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
