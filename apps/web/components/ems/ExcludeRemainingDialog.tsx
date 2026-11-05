"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import {
  EmsService, OnboardingBatchDetail, EXCLUDE_REMAINING_LINK_LABELS,
} from "@/services/ems.service";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "Exclude remaining records" for a partially registered import.
 * Shows what is excluded and kept, and any registered people waiting on an excluded
 * person, before HR confirms with a reason.
 */
export default function ExcludeRemainingDialog({ batchId, accessToken, onClose, onDone }: {
  batchId: string;
  accessToken: string;
  onClose: () => void;
  onDone: (updated: OnboardingBatchDetail, excluded: number) => void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const reasonRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState("");

  const preview = useQuery({
    queryKey: ["ems-exclude-remaining-preview", batchId],
    queryFn: () => EmsService.previewExcludeRemainingOnboardingRecords(batchId, accessToken),
    gcTime: 0,
    staleTime: 0,
  });

  const confirm = useMutation({
    mutationFn: (expectedToken: string) =>
      EmsService.excludeRemainingOnboardingRecords(batchId, { reason: reason.trim(), expectedToken }, accessToken),
    onSuccess: (updated) => onDone(updated, preview.data?.toExclude ?? 0),
  });

  const busy = confirm.isPending;
  useEffect(() => { reasonRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const data = preview.data;
  const trimmed = reason.trim();
  const reasonProblem = trimmed.length === 0 ? null
    : trimmed.length < 5 ? "Use at least 5 characters."
    : trimmed.length > 300 ? "Use at most 300 characters." : null;
  const canConfirm = !!data && !busy && trimmed.length >= 5 && trimmed.length <= 300;
  const stale = (confirm.error as Error | null)?.message?.includes("changed after you reviewed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 text-sm shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={titleId} className="text-base font-bold text-slate-900">Exclude remaining records?</h2>

        {preview.isPending ? (
          <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking this import…</p>
        ) : preview.error ? (
          <p role="alert" className="text-red-600">{(preview.error as Error).message}</p>
        ) : data && (
          <>
            <p className="text-slate-700">
              Exclude <strong>{plural(data.toExclude, "unregistered record")}</strong>; keep{" "}
              <strong>{plural(data.registered, "registered employee")}</strong>.
            </p>
            <p className="text-xs text-slate-500">
              {[data.byStatus.READY && `${data.byStatus.READY} ready`,
                data.byStatus.NEEDS_FIXING && `${data.byStatus.NEEDS_FIXING} need fixing`,
                data.byStatus.DRAFT && `${data.byStatus.DRAFT} not yet validated`].filter(Boolean).join(" · ")}
              {data.alreadyExcluded > 0 && ` · ${data.alreadyExcluded} already excluded stay excluded`}
            </p>

            {data.affectedLinkCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">
                  {plural(data.affectedLinkCount, "registered link")} {data.affectedLinkCount === 1 ? "waits" : "wait"} for someone being excluded.
                </p>
                <p className="mt-0.5">They stay pending and show Needs attention until HR chooses someone else.</p>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                  {data.affectedLinks.map((link, index) => (
                    <li key={`${link.kind}-${link.subject}-${index}`}>
                      {link.subject} — {EXCLUDE_REMAINING_LINK_LABELS[link.kind]} {link.pendingName}
                    </li>
                  ))}
                </ul>
                {data.affectedLinkCount > data.affectedLinks.length && (
                  <p className="mt-1">…and {data.affectedLinkCount - data.affectedLinks.length} more.</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor={reasonId} className="text-xs font-medium text-slate-600">Reason (saved on every excluded record)</label>
              <input id={reasonId} ref={reasonRef} type="text" value={reason} disabled={busy} maxLength={320}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={!!reasonProblem} aria-describedby={reasonProblem ? `${reasonId}-problem` : undefined}
                placeholder="e.g. Demo cleanup, not needed"
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${reasonProblem ? "border-red-300" : "border-slate-200"}`} />
              {reasonProblem && <p id={`${reasonId}-problem`} className="mt-1 text-xs text-red-600">{reasonProblem}</p>}
            </div>

            <p className="text-xs text-slate-500">
              Excluded records stop taking part in duplicate checks. Registered employees still count. You can put any record back later from its row.
            </p>
          </>
        )}

        {confirm.error && (
          <p role="alert" className="text-xs text-red-600">
            {(confirm.error as Error).message}{" "}
            {stale && (
              <button type="button" className="font-medium underline" onClick={() => { confirm.reset(); void preview.refetch(); }}>
                Review again
              </button>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Keep records
          </button>
          <button type="button" disabled={!canConfirm || stale} onClick={() => data && confirm.mutate(data.token)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            {data ? `Exclude ${plural(data.toExclude, "record")}` : "Exclude"}
          </button>
        </div>
      </div>
    </div>
  );
}
