"use client";
import {
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./chart-v3.module.css";

export function ChartColours({
  by,
  mode,
  groups,
  smaller,
  selected,
  onChange,
  tone = "standard",
  part = "chooser",
}: {
  by: "department" | "branch";
  mode: "main" | "custom";
  groups: { id: string; name: string }[];
  smaller: string[];
  selected: string[];
  onChange: (
    mode: "main" | "custom",
    ids: string[],
    tone?: "standard" | "lighter",
  ) => void;
  tone?: "standard" | "lighter";
  part?: "chooser" | "presets";
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [replacement, setReplacement] = useState("");
  const trigger = useRef<HTMLButtonElement>(null),
    id = useId();
  const picker = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scrollBody = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!replacement) return;
    const choices = panel.current?.querySelector<HTMLElement>(
      '[aria-label="Replace a coloured group"]',
    );
    choices?.parentElement?.parentElement?.scrollTo?.({ top: 0 });
    choices?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [replacement]);
  useLayoutEffect(() => {
    if (!open) return;
    const element = panel.current;
    const body = scrollBody.current;
    if (!element || !body) return;
    const move = (x: number, y: number) => {
      body.scrollTop = Math.max(
        0,
        Math.min(body.scrollHeight - body.clientHeight, body.scrollTop + y),
      );
      body.scrollLeft = Math.max(
        0,
        Math.min(body.scrollWidth - body.clientWidth, body.scrollLeft + x),
      );
    };
    const wheel = (event: WheelEvent) => {
      // Browser zoom/pinch remains available; ordinary scrolling belongs to this panel.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? body.clientHeight
            : 1;
      move(event.deltaX * unit, event.deltaY * unit);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const editing = target.matches(
        'input[type="search"], input[type="text"], textarea, [contenteditable="true"]',
      );
      if (editing && !["PageDown", "PageUp"].includes(event.key)) return;
      const distance: Record<string, number> = {
        ArrowDown: 36,
        ArrowUp: -36,
        PageDown: body.clientHeight,
        PageUp: -body.clientHeight,
        Home: -body.scrollHeight,
        End: body.scrollHeight,
      };
      if (!(event.key in distance)) return;
      event.preventDefault();
      event.stopPropagation();
      move(0, distance[event.key]);
    };
    let touch: { x: number; y: number } | null = null;
    const start = (event: TouchEvent) => {
      touch =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    };
    const drag = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) {
        touch = null;
        return;
      }
      const next = event.touches[0];
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      move(touch.x - next.clientX, touch.y - next.clientY);
      touch = { x: next.clientX, y: next.clientY };
    };
    const end = () => {
      touch = null;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("keydown", keyboard);
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", drag, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", keyboard);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", drag);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [open]);
  const noun = by === "department" ? "departments" : "branches";
  const shown = groups
    .filter((g) =>
      g.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  useEffect(() => {
    setQuery("");
    setReplacement("");
  }, [by]);
  useEffect(() => {
    setReplacement("");
  }, [mode, tone, selected.join("\0")]);
  const chosen =
    mode === "main"
      ? groups.slice(0, 13).map((g) => g.id)
      : [...new Set(selected)]
          .filter((id) => groups.some((g) => g.id === id))
          .slice(0, 13);
  const batches = Array.from(
    { length: Math.ceil(smaller.length / 13) },
    (_, n) => smaller.slice(n * 13, (n + 1) * 13),
  );
  const batch =
    mode === "custom" && tone === "lighter"
      ? batches.findIndex(
          (ids) =>
            ids.length === chosen.length &&
            ids.every((id) => chosen.includes(id)),
        )
      : -1;
  const batchDescription =
    batches.length === 1
      ? batch === 0
        ? "All smaller groups coloured"
        : "Colour the smaller groups"
      : batch < 0
        ? `Show batch 1 of ${batches.length}`
        : `Show batch ${((batch + 1) % batches.length) + 1} of ${batches.length}${batch === batches.length - 1 ? ", back to the first" : ""}`;
  const finishReplacement = () => {
    const id = replacement;
    setReplacement("");
    requestAnimationFrame(() => {
      Array.from(
        panel.current?.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]',
        ) || [],
      )
        .find((input) => input.value === id)
        ?.focus();
    });
  };
  const close = () => {
    setOpen(false);
    setReplacement("");
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = (event?: Event) => {
      // Scrolling the checklist must not reposition its own panel.
      if (
        event?.target instanceof Node &&
        panel.current?.contains(event.target)
      )
        return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = window.innerHeight;
      const width = Math.min(480, window.innerWidth - 24);
      const safeTop = window.innerWidth <= 760 ? 76 : 88;
      if (
        rect.bottom <= safeTop ||
        rect.top >= height ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth
      ) {
        setOpen(false);
        return;
      }
      const anchorTop = Math.max(safeTop + 8, Math.min(rect.top, height - 12));
      const anchorBottom = Math.max(
        safeTop,
        Math.min(rect.bottom, height - 12),
      );
      const above = anchorTop - safeTop - 8;
      const below = height - anchorBottom - 20;
      const useAbove = above >= Math.min(420, below);
      const available = useAbove ? above : below;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(available < 400
          ? {
              top: undefined,
              bottom: 12,
              maxHeight: Math.min(560, height - safeTop - 12),
            }
          : useAbove
            ? {
                top: undefined,
                bottom: height - anchorTop + 8,
                maxHeight: Math.min(560, above),
              }
            : {
                top: anchorBottom + 8,
                bottom: undefined,
                maxHeight: Math.min(560, below),
              }),
      });
    };
    const outside = (event: PointerEvent) => {
      if ((event.target as Element)?.closest?.("[data-colour-presets]")) return;
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <div
      ref={picker}
      data-colour-presets={part === "presets" || undefined}
      className={styles.colourPicker}
      onBlur={(e) => {
        // Let native label clicks reach their checkboxes before deciding focus left.
        if (
          e.relatedTarget &&
          !e.currentTarget.contains(e.relatedTarget as Node) &&
          !(e.relatedTarget as Element).closest?.("[data-colour-presets]")
        )
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      {part === "presets" && (
        <>
          <button
            type="button"
            aria-pressed={mode === "main"}
            onClick={() => onChange("main", [], "standard")}
            title="Largest by number of active people, including probation. Other groups stay grey."
          >
            Largest {noun} ({Math.min(13, groups.length)})
          </button>
          {!!smaller.length && (
            <button
              type="button"
              aria-pressed={batch >= 0}
              aria-label={`Smaller ${noun} (${smaller.length}): ${batchDescription}`}
              aria-describedby={`${id}-batch`}
              disabled={batches.length === 1 && batch === 0}
              title={
                batches.length > 1
                  ? batch < 0
                    ? "Show the first smaller batch. Click again for the next batch."
                    : batch === batches.length - 1
                      ? "Show the first smaller batch again."
                      : "Show the next smaller batch."
                  : "Use lighter colours for the smaller groups. Other groups stay grey."
              }
              onClick={() =>
                onChange(
                  "custom",
                  batches[(batch + 1) % batches.length],
                  "lighter",
                )
              }
            >
              Smaller {noun} ({smaller.length})
              <span className={styles.batchAction} aria-hidden="true">
                {batches.length === 1
                  ? batch === 0
                    ? "✓"
                    : "→"
                  : batch < 0
                    ? "→"
                    : `${batch + 1}/${batches.length} ${batch === batches.length - 1 ? "↻" : "→"}`}
              </span>
            </button>
          )}
          {!!smaller.length && (
            <span id={`${id}-batch`} className={styles.srOnly} role="status">
              {batch < 0
                ? `Smaller groups: ${batches.length} ${batches.length === 1 ? "batch" : "batches"}.`
                : `Batch ${batch + 1} of ${batches.length} · ${batch * 13 + 1}–${Math.min((batch + 1) * 13, smaller.length)} of ${smaller.length}${batches.length === 1 ? ". All smaller groups coloured." : ". Click again for the next batch."}`}
            </span>
          )}
        </>
      )}
      {part === "chooser" && (
        <>
          <button
            ref={trigger}
            type="button"
            aria-pressed={mode === "custom" && batch < 0}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((v) => !v)}
          >
            Choose colours…
          </button>
          {open && (
            <div
              ref={panel}
              id={id}
              className={styles.colourOptions}
              style={position}
              role="group"
              aria-label="Chart colours"
            >
              <div className={styles.selectionSummary}>
                <strong>Choose {noun}</strong>
                <span role="status">{chosen.length} / 13 coloured</span>
              </div>
              <p className={styles.hint}>
                Choose any mix. Changes apply immediately; others stay grey.
              </p>
              <div className={styles.selectionSummary}>
                <span>
                  {groups.length} {noun} with employees · A–Z
                </span>
                <button
                  type="button"
                  disabled={!chosen.length}
                  onClick={() => onChange("custom", [])}
                >
                  Clear selection
                </button>
              </div>
              <label>
                Search {noun}
                <input
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div
                ref={scrollBody}
                className={styles.colourBody}
                data-colour-scroll
              >
                <div className={styles.groupChecks}>
                  {replacement ? (
                    <div
                      className={styles.replaceColours}
                      role="group"
                      aria-label="Replace a coloured group"
                    >
                      <strong>
                        Make room for{" "}
                        {groups.find((g) => g.id === replacement)?.name}
                      </strong>
                      <p>
                        Choose which group returns to grey. Its colour will go
                        to the new choice.
                      </p>
                      {chosen.map((id) => (
                        <button
                          type="button"
                          key={id}
                          onClick={() => {
                            onChange("custom", [
                              ...chosen.filter((value) => value !== id),
                              replacement,
                            ]);
                            finishReplacement();
                          }}
                        >
                          Replace {groups.find((g) => g.id === id)?.name}
                        </button>
                      ))}
                      <button type="button" onClick={finishReplacement}>
                        Cancel replacement
                      </button>
                    </div>
                  ) : (
                    shown.map((g) => (
                      <label key={g.id}>
                        <input
                          type="checkbox"
                          value={g.id}
                          checked={chosen.includes(g.id)}
                          onChange={(e) => {
                            if (e.target.checked && chosen.length === 13) {
                              setReplacement(g.id);
                              return;
                            }
                            onChange(
                              "custom",
                              e.target.checked
                                ? [...chosen, g.id]
                                : chosen.filter((id) => id !== g.id),
                            );
                          }}
                        />
                        {g.name}
                      </label>
                    ))
                  )}
                  {!replacement && !shown.length && <p>No matching {noun}.</p>}
                </div>
              </div>
              <div className={styles.colourFooter}>
                <span>
                  {mode === "main"
                    ? `Largest ${noun} coloured`
                    : "Your choice coloured"}
                </span>
                <button type="button" onClick={close}>
                  Done
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
