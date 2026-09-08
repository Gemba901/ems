"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, Circle, Lock, Loader2, Info } from "lucide-react";
import type { SteelMelting } from "@/services/steel-melting.service";

export type SubStepStatus = "done" | "active" | "locked";

export type StepProps = {
  melting: SteelMelting;
  token: string;
  onSaved: () => void;
  onError: (err: unknown) => void;
};

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: SubStepStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
        <Circle className="h-3.5 w-3.5 fill-blue-100" /> In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
      <Lock className="h-3 w-3" /> Locked
    </span>
  );
}

export function SubStepCard({
  code, title, status, help, children,
}: { code: string; title: string; status: SubStepStatus; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className={status === "locked" ? "opacity-70" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm">
            <span className="text-slate-400 font-mono text-xs mr-1.5">{code}</span>
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {help}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{label}</>;
}

export function LockedNote() {
  return <p className="text-sm text-slate-400">Complete the previous step first.</p>;
}

/**
 * Renders a section as an always-visible card with a status badge next to
 * its heading (done / in progress / locked). Content is never collapsed.
 */
export function SubStep({
  code, title, status, help, children,
}: { code: string; title: string; status: SubStepStatus; summary?: React.ReactNode; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <SubStepCard code={code} title={title} status={status} help={help}>
      {children}
    </SubStepCard>
  );
}

export function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

/**
 * Humanizes a SteelMeltingStage enum member (e.g. "A09_MONITOR_TEMPERATURE")
 * into a short display phase label — a pure display transform of the real
 * stage value, not a new stage taxonomy. Shared by the P05 dashboard's
 * FurnaceStatusPanel and the Heat Operations info strip so both read the
 * same phase name for a given stage.
 */
export function stageLabel(stage: string): string {
  const withoutCode = stage.replace(/^A\d{2}_/, "");
  return withoutCode
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Minimal horizontal tab bar — no accordion, no external tabs dependency
 * (none is installed; recharts is the only new-ish package already in
 * package.json). Purely a button-group + content-swap, same pattern as
 * MeltingSidebarNav but horizontal. Used for read-only, non-gated grouping
 * only — never for content whose visibility is gated by backend
 * allowedActions, which must stay driven by explicit status props, not tab
 * selection.
 */
export function SimpleTabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={
            "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors " +
            (t.key === active ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export interface HelpSection {
  heading: string;
  body: React.ReactNode;
}

/**
 * On-demand "ⓘ Help" popover for the active step's title — replaces the
 * persistent sidebar. Content is relocated from each screen's former
 * Sidebar() cards, unchanged, not rewritten.
 */
export function HelpPopover({ title, sections }: { title: string; sections: HelpSection[] }) {
  return (
    <Popover>
      <PopoverTrigger
        render={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            <Info className="h-3.5 w-3.5" />
            Help
          </button>
        )}
      />
      <PopoverContent>
        <p className="text-sm font-semibold text-slate-900 mb-2">{title}</p>
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.heading}>
              <p className="text-xs font-semibold text-slate-600 mb-0.5">{s.heading}</p>
              <div className="text-xs text-slate-500 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
