"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  ApprovedDirection,
  DirectionStatus,
  SectionStamp,
} from "@/services/leadership-excellence/strategic-direction.service";

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
  const common = {
    id,
    value,
    maxLength,
    readOnly,
    placeholder,
    "aria-invalid": invalid || undefined,
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
        <span>{hint}</span>
        <span className="shrink-0 tabular-nums">
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
  number: string;
  title: string;
  description: string;
  label?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      {label && <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {number}
          </span>
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
      variant={status === "APPROVED" ? "default" : status === "IN_REVIEW" ? "outline" : "secondary"}
      className={cn(status === "APPROVED" && "bg-gemba-lime-ink text-white")}
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
        tone === "info" && "border-border bg-muted/50 text-foreground",
        tone === "warning" && "border-destructive/30 bg-destructive/5 text-foreground",
        tone === "success" && "border-gemba-lime/40 bg-gemba-lime/10 text-foreground",
      )}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

/**
 * Confirmation dialog on the native <dialog> (focus trap and Escape for free).
 * With `reasonLabel`, the confirm button stays disabled until a reason is typed.
 */
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
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const needsReason = !!reasonLabel;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        setReason("");
        onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        method="dialog"
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (needsReason && !reason.trim()) return;
          onConfirm(reason.trim());
        }}
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
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
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || (needsReason && !reason.trim())}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** Read-only reading view of an approved direction (employee view; reused by 01.03 preview). */
export function DirectionReadView({ direction }: { direction: ApprovedDirection }) {
  const block = (heading: string, text: string, why?: { label: string; text: string }) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{heading}</h3>
      <p className="text-base whitespace-pre-line text-foreground">{text}</p>
      {why && (
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground">{why.label}</div>
          <p className="text-sm whitespace-pre-line">{why.text}</p>
        </div>
      )}
    </div>
  );
  return (
    <article className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{direction.company}</h2>
        <p className="text-sm text-muted-foreground">{direction.business}</p>
        <p className="text-xs text-muted-foreground">
          Approved · version {direction.version} · {formatDate(direction.approvedAt)}
          {direction.approvedByName && ` · ${direction.approvedByName}`}
        </p>
      </header>
      {block("Purpose — Why we exist", direction.purpose)}
      {block("Vision — Our North Star", direction.vision, { label: "Why this vision?", text: direction.visionWhy })}
      {block("Mission — Our Path", direction.mission, { label: "Why this mission?", text: direction.missionWhy })}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Core values — How we work</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {direction.values.map((v) => (
            <li key={v.id} className="rounded-lg border border-border p-3">
              <div className="font-medium">{v.name}</div>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{v.why}</p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
