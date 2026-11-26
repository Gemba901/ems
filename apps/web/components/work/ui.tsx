"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { HelpCircle, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TASK_STATUS_LABELS, TASK_STATUSES, type WorkTaskStatus } from "@/services/work.service";

// Shared building blocks for the Team Workspace screens: one blue accent, white surfaces.

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500";

export const primaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const linkButton =
  "inline-flex items-center gap-1 rounded text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</section>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function TaskStatusBadge({ status }: { status: WorkTaskStatus }) {
  return <StatusBadge status={status} label={TASK_STATUS_LABELS[status]} />;
}

export function TaskStatusSelect({
  id,
  value,
  onChange,
  disabled,
  label,
  hideLabel,
}: {
  id: string;
  value: WorkTaskStatus;
  onChange: (status: WorkTaskStatus) => void;
  disabled?: boolean;
  label: string;
  hideLabel?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-foreground"}>
        {label}
      </label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as WorkTaskStatus)}
        className="min-h-9"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABELS[s]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Accessible modal: focus is trapped inside, Escape closes, focus returns to the trigger. */
export function WorkDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-h-[90dvh]",
        footer ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]",
        size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
      )}>
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-1">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/** A "?" that explains a term on hover, and on tap or keyboard focus for touch and keyboard users. */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={100}
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="text-sm leading-relaxed text-slate-600">{children}</PopoverContent>
    </Popover>
  );
}

/** The term used across the app; teams outside software often call it a phase. */
export const SPRINT_TERM = "Sprint / Phase";

export function SprintHelp() {
  return (
    <HelpTip label="What is a sprint or phase?">
      <p className="font-semibold text-slate-800">Sprint / Phase</p>
      <p className="mt-1">
        A fixed stretch of time (often 1–4 weeks) in which part of the project&apos;s work is planned and finished. Tasks are
        scheduled into it, and when it ends, unfinished tasks go back to the backlog.
      </p>
      <p className="mt-1">
        Several can run at once, so a large team can split up and work on different parts of a project in parallel.
      </p>
    </HelpTip>
  );
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
