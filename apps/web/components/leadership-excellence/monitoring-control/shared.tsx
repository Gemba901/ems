"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDirectory } from "@/services/leadership-excellence/monitoring-control.service";
import type { DataStatus, Directory, MonitoringFilters, PerformanceStatus } from "./types";

// Shared building blocks for the three Area 05 screens.

export function useDirectory() {
  const { accessToken, user } = useAuthStore();
  const query = useQuery({
    queryKey: ["lex05-directory", user?.organizationId],
    queryFn: ({ signal }) => getDirectory(accessToken!, signal),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });
  const dir: Directory = query.data ?? { me: null, people: {}, departments: [] };
  return {
    me: dir.me,
    departments: dir.departments,
    person: (id: string | null | undefined) => (id ? dir.people[id] ?? "Unknown person" : "—"),
    department: (id: string | null | undefined) => (id ? dir.departments.find(d => d.id === id)?.name ?? "Unknown department" : "Organisation"),
  };
}

export function PageHeader({ code, title, lead, children }: { code: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <header className="space-y-1.5">
      <p className="text-sm font-medium text-muted-foreground">{code}</p>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{lead}</p>
      {children}
    </header>
  );
}

export function HowTo({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-card-foreground">
      <summary className="cursor-pointer font-medium">How to use this section</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </details>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(error as Error)?.message ?? "Something went wrong."}</p>;
}

export function Loading({ label }: { label: string }) {
  return <p role="status" className="text-sm text-muted-foreground">{label}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Department + month filters, shared by 05.01 and 05.02. */
export function Filters({ value, onChange, monthLabel = "Month" }: { value: MonitoringFilters; onChange: (v: MonitoringFilters) => void; monthLabel?: string }) {
  const { departments } = useDirectory();
  const field = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Department</span>
        <select className={field} value={value.departmentId ?? ""} onChange={e => onChange({ ...value, departmentId: e.target.value || undefined })}>
          <option value="">All I can see</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">{monthLabel}</span>
        <input type="month" className={field} value={value.month ?? ""} onChange={e => onChange({ ...value, month: e.target.value || undefined })} />
      </label>
      {(value.departmentId || value.month) && <Button variant="ghost" size="sm" onClick={() => onChange({})}>Clear filters</Button>}
    </div>
  );
}

type Tone = "green" | "amber" | "red" | "gray" | "navy";
const TONES: Record<Tone, string> = {
  green: "border-gemba-lime/40 bg-gemba-lime/10 text-gemba-lime-ink",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  red: "border-gemba-red/40 bg-gemba-red/10 text-gemba-red-ink",
  gray: "border-border bg-muted text-muted-foreground",
  navy: "border-gemba-navy/30 bg-gemba-navy/10 text-gemba-navy",
};

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

const PERFORMANCE: Record<PerformanceStatus, [string, Tone]> = {
  ON_TARGET: ["On target", "green"],
  NEEDS_ATTENTION: ["Needs attention", "amber"],
  BELOW_TARGET: ["Below target", "red"],
  NOT_MEASURED: ["Not measured", "gray"],
  TARGET_INCOMPLETE: ["Target incomplete", "gray"],
};
export function PerformancePill({ status }: { status: PerformanceStatus | null | undefined }) {
  if (!status) return <Pill tone="gray">Incomplete data</Pill>;
  const [label, tone] = PERFORMANCE[status];
  return <Pill tone={tone}>{label}</Pill>;
}

const DATA: Record<DataStatus, [string, Tone]> = {
  NOT_SCHEDULED: ["Not scheduled", "gray"],
  NOT_YET_DUE: ["Not yet due", "gray"],
  NOT_REPORTED: ["Not reported", "red"],
  PENDING_VERIFICATION: ["Awaiting verification", "amber"],
  VERIFIED: ["Verified", "green"],
};
export function DataPill({ status }: { status: DataStatus }) {
  const [label, tone] = DATA[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export const fmt = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: dp });

export const pretty = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

export const periodLabel = (start: string, end: string) =>
  start.slice(0, 7) === end.slice(0, 7)
    ? new Date(`${start}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${pretty(start)} – ${pretty(end)}`;

export const targetLabel = (target: number | null, upper: number | null) =>
  upper !== null && upper !== undefined ? `${fmt(target)} – ${fmt(upper)}` : fmt(target);

/** A modal that asks for a note before an action. Required notes block Confirm until filled. */
export function NoteDialog({
  title, description, label, required, confirm, busy, disabled, error, onConfirm, onClose, children,
}: {
  title: string;
  description?: ReactNode;
  label: string;
  required?: boolean;
  confirm: string;
  busy?: boolean;
  disabled?: boolean;
  error?: ReactNode;
  onConfirm: (note: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  const blocked = busy || disabled || (required && !note.trim());
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40">
      <form method="dialog" className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); if (!blocked) onConfirm(note.trim()); }}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X /></Button>
        </div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        {children}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{label}{required ? "" : " (optional)"}</span>
          <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm" rows={3} maxLength={1500} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {error}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={blocked}>{busy ? "Saving…" : confirm}</Button>
        </div>
      </form>
    </dialog>
  );
}
