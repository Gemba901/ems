"use client";

import { CheckCircle2, Circle, type LucideIcon } from "lucide-react";

export interface SidebarSection {
  key: string;
  label: string;
  icon: LucideIcon;
  done: boolean;
}

/**
 * Fixed left nav for the P05 input screen — replaces the former accordion.
 * Every section is a full-swap click target, never an expand/collapse: the
 * active section renders its full form in the content pane, inactive
 * sections collapse to a single line here (dashed circle = not started,
 * check = complete).
 */
export function MeltingSidebarNav({
  sections,
  activeKey,
  onSelect,
}: {
  sections: SidebarSection[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="w-40 shrink-0 space-y-0.5">
      {sections.map((s) => {
        const isActive = s.key === activeKey;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            className={
              "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm rounded-md border-l-2 transition-colors " +
              (isActive
                ? "border-l-blue-600 bg-blue-50/60 text-slate-900 font-medium"
                : "border-l-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700")
            }
          >
            {s.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0" strokeDasharray="2.5 2" />
            )}
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
