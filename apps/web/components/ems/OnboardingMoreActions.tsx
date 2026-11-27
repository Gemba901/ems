"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MoreAction = { key: string; label: string; icon?: ReactNode; danger?: boolean; title?: string; onSelect: () => void;
  /** Shown only on phones, where the action has no button of its own in the top bar. */
  phoneOnly?: boolean;
  disabled?: boolean };

/**
 * Occasional batch actions behind one compact "⋯" button, so they don't take
 * permanent toolbar space. Closes on choice, outside click and Escape.
 */
export default function OnboardingMoreActions({ actions, disabled }: { actions: MoreAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  if (!actions.length) return null;
  // With only phone actions, the "⋯" button has nothing to offer on wider screens.
  const phoneOnly = actions.every(action => action.phoneOnly);

  return (
    <div ref={root} className={`relative shrink-0 ${phoneOnly ? 'sm:hidden' : ''}`}>
      <Button variant="ghost" ref={button} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label="More actions" title="More actions" onClick={() => setOpen(value => !value)}
        className="inline-flex items-center justify-center rounded-xl border border-border px-2.5 py-2.5 text-muted-foreground hover:bg-muted disabled:opacity-40 max-sm:px-2 h-auto whitespace-normal">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-30 mt-1 min-w-[14rem] rounded-xl border border-border bg-card p-1 shadow-lg">
          {actions.map(action => (
            <Button variant="ghost" key={action.key} type="button" role="menuitem" title={action.title} disabled={action.disabled}
              onClick={() => { setOpen(false); action.onSelect(); }}
              className={`h-auto whitespace-normal flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold disabled:opacity-40 ${action.phoneOnly ? "sm:hidden" : ""} ${action.danger ? "text-danger hover:bg-danger-subtle" : "text-foreground hover:bg-muted"}`}>
              {action.icon}{action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
