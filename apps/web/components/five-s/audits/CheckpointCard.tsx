"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { LOCATION_COUNT_OPTIONS, countLabel } from "@/lib/five-s/scoring";
import type { AuditCheckpoint, AuditResponsePayload } from "@/services/five-s.service";
import { ActionStatusBadge, DueDate, FileUploader, PhotoGallery } from "@/components/five-s/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Severity spectrum for the 0–5+ problem-location count: green (none) through to red (5+).
// Class strings are spelled out in full so Tailwind keeps them.
const COUNT_TONES: Record<number, { idle: string; selected: string; card: string; dot: string; badge: string }> = {
  0: {
    idle: "border-border bg-card text-success hover:bg-success-subtle",
    selected: "border-transparent bg-success text-success-foreground hover:bg-success/90",
    card: "border-success",
    dot: "bg-success text-success-foreground",
    badge: "bg-success-subtle text-success ring-1 ring-success/25",
  },
  1: {
    idle: "border-border bg-card text-success hover:bg-success-subtle",
    selected: "border-transparent bg-success text-success-foreground hover:bg-success/90",
    card: "border-success/50",
    dot: "bg-success text-success-foreground",
    badge: "bg-success-subtle text-success ring-1 ring-success/25",
  },
  2: {
    idle: "border-border bg-card text-warning hover:bg-warning-subtle",
    selected: "border-transparent bg-warning text-warning-foreground hover:bg-warning/90",
    card: "border-warning/50",
    dot: "bg-warning text-warning-foreground",
    badge: "bg-warning-subtle text-warning ring-1 ring-warning/25",
  },
  3: {
    idle: "border-border bg-card text-warning hover:bg-warning-subtle",
    selected: "border-transparent bg-warning text-warning-foreground hover:bg-warning/90",
    card: "border-warning",
    dot: "bg-warning text-warning-foreground",
    badge: "bg-warning-subtle text-warning ring-1 ring-warning/25",
  },
  4: {
    idle: "border-border bg-card text-warning hover:bg-warning-subtle",
    selected: "border-transparent bg-warning text-warning-foreground hover:bg-warning/90",
    card: "border-warning",
    dot: "bg-warning text-warning-foreground",
    badge: "bg-warning-subtle text-warning ring-1 ring-warning/25",
  },
  5: {
    idle: "border-border bg-card text-danger hover:bg-danger-subtle",
    selected: "border-transparent bg-danger text-danger-foreground hover:bg-danger/90",
    card: "border-danger",
    dot: "bg-danger text-danger-foreground",
    badge: "bg-danger-subtle text-danger ring-1 ring-danger/25",
  },
};

const toneFor = (count: number) => COUNT_TONES[Math.min(Math.max(count, 0), 5)];

/** One checkpoint while the audit is a draft: a required 0–5+ selection plus optional notes and photos. */
export function CheckpointEditor({
  checkpoint,
  count,
  missing,
  disabled,
  onCount,
  onSave,
}: {
  checkpoint: AuditCheckpoint;
  count: number | null;
  missing: boolean;
  disabled?: boolean;
  onCount: (value: number | null) => void;
  onSave: (patch: Omit<AuditResponsePayload, "checkpointNo">) => void;
}) {
  const [affected, setAffected] = useState(checkpoint.affectedLocations ?? "");
  const [remark, setRemark] = useState(checkpoint.remark ?? "");
  const [photos, setPhotos] = useState(checkpoint.photoUrls);
  const hasNotes = !!(affected || remark || photos.length);
  const [open, setOpen] = useState(hasNotes);
  const labelId = `cp-${checkpoint.no}-label`;

  return (
    <li
      id={`checkpoint-${checkpoint.no}`}
      className={cn(
        "scroll-mt-40 rounded-xl border bg-card p-4 shadow-sm",
        missing ? "border-danger ring-2 ring-danger/25" : count == null ? "border-border" : toneFor(count).card,
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            count == null ? "bg-muted text-muted-foreground" : toneFor(count).dot,
          )}
          aria-hidden="true"
        >
          {checkpoint.no}
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-medium text-foreground">
            <span className="sr-only">Checkpoint {checkpoint.no}: </span>
            {checkpoint.text}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Number of problem locations found</p>
          <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
            {LOCATION_COUNT_OPTIONS.map((v) => {
              const selected = count === v;
              return (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => onCount(v)}
                  className={cn(
                    "min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    selected ? toneFor(v).selected : toneFor(v).idle,
                  )}
                >
                  {countLabel(v)}
                </Button>
              );
            })}
            {count != null && !disabled && (
              <Button type="button" variant="ghost" onClick={() => onCount(null)} className="min-h-11 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                Clear
              </Button>
            )}
          </div>
          {missing && (
            <p className="mt-2 text-xs font-semibold text-danger" role="alert">
              Not answered. Choose 0–5+; a blank is not zero.
            </p>
          )}
          {count != null && count > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {count >= 5 ? "5+ counts as 5 points." : `${count} point(s).`} An improvement action will be raised for this checkpoint when you submit.
            </p>
          )}

          <Button
            type="button"
            onClick={() => setOpen((o) => !o)}
            variant="ghost"
            aria-expanded={open}
            className="mt-3 h-auto min-h-9 max-w-full justify-start whitespace-normal text-left text-xs font-medium text-primary hover:underline"
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            {hasNotes ? "Notes and photos" : "Add affected locations, remark or photos (optional)"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </Button>
          {open && (
            <div className="mt-2 space-y-3 rounded-lg bg-muted p-3">
              <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                Affected locations
                <Textarea
                  rows={2}
                  value={affected}
                  maxLength={2000}
                  disabled={disabled}
                  placeholder="e.g. Rack B3, bench 2, aisle near press 4"
                  onChange={(e) => setAffected(e.target.value)}
                  onBlur={() => affected !== (checkpoint.affectedLocations ?? "") && onSave({ affectedLocations: affected })}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-muted-foreground">
                Remark
                <Textarea
                  rows={2}
                  value={remark}
                  maxLength={2000}
                  disabled={disabled}
                  onChange={(e) => setRemark(e.target.value)}
                  onBlur={() => remark !== (checkpoint.remark ?? "") && onSave({ remark })}
                />
              </label>
              <div className="space-y-1 text-xs font-medium text-muted-foreground">
                Photos
                <FileUploader
                  urls={photos}
                  folder="five-s/audits"
                  disabled={disabled}
                  onChange={(urls) => {
                    setPhotos(urls);
                    onSave({ photoUrls: urls });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** A checkpoint on a submitted (locked) audit, with the action raised from it. */
export function CheckpointResult({ checkpoint }: { checkpoint: AuditCheckpoint }) {
  const count = checkpoint.locationCount ?? 0;
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground" aria-hidden="true">
          {checkpoint.no}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{checkpoint.text}</p>
            <span
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums",
                toneFor(count).badge,
              )}
              title="Problem locations"
            >
              {countLabel(count)}
            </span>
          </div>
          {checkpoint.affectedLocations && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Affected locations:</span> {checkpoint.affectedLocations}
            </p>
          )}
          {checkpoint.remark && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Remark:</span> {checkpoint.remark}
            </p>
          )}
          {checkpoint.photoUrls.length > 0 && (
            <div className="mt-2">
              <PhotoGallery urls={checkpoint.photoUrls} />
            </div>
          )}
          {checkpoint.action && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link href={`/five-s/actions/${checkpoint.action.id}`} className="font-medium text-primary hover:underline">
                {checkpoint.action.reference}
              </Link>
              <ActionStatusBadge status={checkpoint.action.status} />
              <span>Owner: {checkpoint.action.owner?.name ?? "not assigned"}</span>
              <DueDate date={checkpoint.action.dueDate} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
