"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import type { DirectionStatus, SectionStamp } from "@/services/leadership-excellence/strategic-direction.service";

// Prototype palette (teal), scoped to Strategic Direction by overriding the kit's colour tokens.
// globals.css uses @theme inline, so utilities read the raw tokens (--primary, …), not --color-*.
// Kit components (Button, Badge, Input) pick it up without changing globals.css.
export const DIRECTION_THEME = cn(
  "[--primary:#12796f] [--primary-foreground:#fff] [--ring:#12796f]",
  "[--foreground:#1c3440] [--card-foreground:#1c3440] [--muted-foreground:#627d87]",
  "[--border:#d8e4e7] [--input:#b9cdd3] [--muted:#f4f8f8]",
  "[--secondary:#e9f4f1] [--secondary-foreground:#167366]",
  "[--accent:#edf6f3] [--accent-foreground:#0d665d]",
  "dark:[--primary:#3fb5a6] dark:[--primary-foreground:#0b1f26] dark:[--ring:#3fb5a6]",
  "dark:[--foreground:#e6f1f2] dark:[--card-foreground:#e6f1f2] dark:[--muted-foreground:#9bb6bd]",
  "dark:[--border:#2a4650] dark:[--input:#36565f] dark:[--muted:#16313a]",
  "dark:[--secondary:#173f3d] dark:[--secondary-foreground:#8fd9cd]",
  "dark:[--accent:#173f3d] dark:[--accent-foreground:#8fd9cd]",
);

/** Teal uppercase label (prototype `.fw-label`). */
export const EYEBROW = "text-xs font-semibold tracking-wider text-primary uppercase";

// Dates follow the prototype: East Africa Time, day month year.
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Nairobi",
});
export const formatDate = (iso: string) => `${DATE.format(new Date(iso))} EAT`;

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 read-only:bg-muted/40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm";

/** A labelled input or textarea with the prototype's hint and "n / max" counter. */
export function TextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  readOnly,
  invalid,
  multiline,
  rows = 4,
  placeholder,
  hint,
  required,
}: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  readOnly?: boolean;
  invalid?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const hintId = `${id}-hint`;
  // Text saved under older, longer limits can still arrive over the limit; flag it instead of cutting it.
  const over = value.length > maxLength;
  const common = {
    id,
    value,
    maxLength,
    readOnly,
    placeholder,
    "aria-invalid": invalid || over || undefined,
    "aria-describedby": hintId,
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-xs font-normal text-muted-foreground">Required before finalising</span>}
      </label>
      {multiline ? (
        <textarea {...common} rows={rows} className={textareaClass} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} className="read-only:bg-muted/40" onChange={(e) => onChange(e.target.value)} />
      )}
      <div id={hintId} className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span className={cn(over && "font-medium text-destructive")}>
          {over
            ? `${(value.length - maxLength).toLocaleString()} characters over the limit. Shorten it to save.`
            : hint}
        </span>
        <span className={cn("shrink-0 tabular-nums", over && "font-semibold text-destructive")}>
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function SectionCard({
  id,
  number,
  title,
  description,
  label,
  action,
  children,
}: {
  id: string;
  /** Step number badge; omitted in the read-only employee view. */
  number?: string;
  title: string;
  description: string;
  label?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      {label && <div className={cn("mb-3", EYEBROW)}>{label}</div>}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          {number && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {number}
            </span>
          )}
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function SectionMeta({ stamp }: { stamp?: SectionStamp }) {
  return (
    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
      {stamp ? `Last updated ${formatDate(stamp.at)}${stamp.byName ? ` · ${stamp.byName}` : ""}` : "Not saved yet."}
    </p>
  );
}

/** Same wording as applyState() in the prototype. */
export function DirectionStatusBadge({ status, hasApproved }: { status: DirectionStatus; hasApproved: boolean }) {
  const label =
    status === "APPROVED"
      ? "Approved & locked"
      : status === "IN_REVIEW"
        ? "Under review"
        : hasApproved
          ? "Revision · draft"
          : "Draft · editable";
  return (
    <Badge
      variant={status === "APPROVED" ? "default" : "secondary"}
      className={cn(status === "IN_REVIEW" && "bg-[#fff1da] text-[#8d5d16] dark:bg-[#3d2e14] dark:text-[#f0c77d]")}
    >
      {label}
    </Badge>
  );
}

export function Notice({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "warning" | "success";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-primary/25 bg-accent text-foreground",
        tone === "warning" && "border-[#ead8b4] bg-[#fff8eb] text-foreground dark:border-[#5c4a26] dark:bg-[#2e2615]",
        tone === "success" && "border-[#c6e4d5] bg-[#edf8f3] text-foreground dark:border-[#2c5a47] dark:bg-[#15302a]",
      )}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

/** Collapsible "how to" guide at the top of a section (prototype `.inline-guide`). */
export function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-border bg-muted px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-secondary-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </details>
  );
}

/** Modal on the native <dialog>: focus trap, Escape and the backdrop for free. */
export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  size = "sm",
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  size?: "sm" | "lg";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-[#102f3b]/50",
        size === "sm" ? "w-[min(32rem,calc(100vw-2rem))]" : "w-[min(56rem,calc(100vw-2rem))]",
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              {eyebrow && <div className={EYEBROW}>{eyebrow}</div>}
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </header>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Confirmation dialog. With `reasonLabel`, the confirm button stays disabled until a reason is typed. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  reasonLabel,
  reasonPlaceholder,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const needsReason = !!reasonLabel;
  const close = () => {
    setReason("");
    onClose();
  };
  return (
    <Modal open={open} title={title} onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsReason && !reason.trim()) return;
          onConfirm(reason.trim());
        }}
      >
        <p className="text-sm text-muted-foreground">{message}</p>
        {needsReason && (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={1000}
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              className={textareaClass}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || (needsReason && !reason.trim())}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
