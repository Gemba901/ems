"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { LOCATION_COUNT_OPTIONS, countLabel } from "@/lib/five-s/scoring";
import type { AuditCheckpoint, AuditResponsePayload } from "@/services/five-s.service";
import { ActionStatusBadge, DueDate, FileUploader, PhotoGallery, inputClass } from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

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
        "scroll-mt-40 rounded-xl border bg-white p-4 shadow-sm",
        missing ? "border-red-300 ring-2 ring-red-100" : count == null ? "border-slate-200" : "border-emerald-200",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            count == null ? "bg-slate-100 text-slate-600" : "bg-emerald-600 text-white",
          )}
          aria-hidden="true"
        >
          {checkpoint.no}
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-medium text-slate-900">
            <span className="sr-only">Checkpoint {checkpoint.no}: </span>
            {checkpoint.text}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Number of problem locations found</p>
          <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
            {LOCATION_COUNT_OPTIONS.map((v) => {
              const selected = count === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => onCount(v)}
                  className={cn(
                    "min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60",
                    selected
                      ? v === 0
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50",
                  )}
                >
                  {countLabel(v)}
                </button>
              );
            })}
            {count != null && !disabled && (
              <button type="button" onClick={() => onCount(null)} className="min-h-11 px-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
                Clear
              </button>
            )}
          </div>
          {missing && (
            <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
              Not answered. Choose 0–5+; a blank is not zero.
            </p>
          )}
          {count != null && count > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {count >= 5 ? "5+ counts as 5 points." : `${count} point(s).`} An improvement action will be raised for this checkpoint when you submit.
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            {hasNotes ? "Notes and photos" : "Add affected locations, remark or photos (optional)"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
          {open && (
            <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Affected locations
                <textarea
                  rows={2}
                  className={inputClass}
                  value={affected}
                  maxLength={2000}
                  disabled={disabled}
                  placeholder="e.g. Rack B3, bench 2, aisle near press 4"
                  onChange={(e) => setAffected(e.target.value)}
                  onBlur={() => affected !== (checkpoint.affectedLocations ?? "") && onSave({ affectedLocations: affected })}
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Remark
                <textarea
                  rows={2}
                  className={inputClass}
                  value={remark}
                  maxLength={2000}
                  disabled={disabled}
                  onChange={(e) => setRemark(e.target.value)}
                  onBlur={() => remark !== (checkpoint.remark ?? "") && onSave({ remark })}
                />
              </label>
              <div className="space-y-1 text-xs font-medium text-slate-600">
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
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">
          {checkpoint.no}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">{checkpoint.text}</p>
            <span
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums",
                count === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
              )}
              title="Problem locations"
            >
              {countLabel(count)}
            </span>
          </div>
          {checkpoint.affectedLocations && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium">Affected locations:</span> {checkpoint.affectedLocations}
            </p>
          )}
          {checkpoint.remark && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium">Remark:</span> {checkpoint.remark}
            </p>
          )}
          {checkpoint.photoUrls.length > 0 && (
            <div className="mt-2">
              <PhotoGallery urls={checkpoint.photoUrls} />
            </div>
          )}
          {checkpoint.action && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <Link href={`/five-s/actions/${checkpoint.action.id}`} className="font-medium text-blue-700 hover:underline">
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
