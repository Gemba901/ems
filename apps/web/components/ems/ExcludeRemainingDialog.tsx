"use client";

import { useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import {
  EmsService, OnboardingBatchDetail, EXCLUDE_REMAINING_LINK_LABELS,
} from "@/services/ems.service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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

  const data = preview.data;
  const trimmed = reason.trim();
  const reasonProblem = trimmed.length === 0 ? null
    : trimmed.length < 5 ? "Use at least 5 characters."
    : trimmed.length > 300 ? "Use at most 300 characters." : null;
  const canConfirm = !!data && !busy && trimmed.length >= 5 && trimmed.length <= 300;
  const stale = (confirm.error as Error | null)?.message?.includes("changed after you reviewed");

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} initialFocus={reasonRef} aria-labelledby={titleId}
        className="w-full max-w-lg gap-0 space-y-4 rounded-2xl bg-card p-5 text-sm shadow-xl ring-0 sm:max-w-lg">
        <h2 id={titleId} className="text-base font-bold text-foreground">Exclude remaining records?</h2>

        {preview.isPending ? (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking this import…</p>
        ) : preview.error ? (
          <p role="alert" className="text-danger">{(preview.error as Error).message}</p>
        ) : data && (
          <>
            <p className="text-foreground">
              Exclude <strong>{plural(data.toExclude, "unregistered record")}</strong>; keep{" "}
              <strong>{plural(data.registered, "registered employee")}</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              {[data.byStatus.READY && `${data.byStatus.READY} ready`,
                data.byStatus.NEEDS_FIXING && `${data.byStatus.NEEDS_FIXING} need fixing`,
                data.byStatus.DRAFT && `${data.byStatus.DRAFT} not yet validated`].filter(Boolean).join(" · ")}
              {data.alreadyExcluded > 0 && ` · ${data.alreadyExcluded} already excluded stay excluded`}
            </p>

            {data.affectedLinkCount > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
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
              <label htmlFor={reasonId} className="text-xs font-medium text-muted-foreground">Reason (saved on every excluded record)</label>
              <Input id={reasonId} ref={reasonRef} type="text" value={reason} disabled={busy} maxLength={320}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={!!reasonProblem} aria-describedby={reasonProblem ? `${reasonId}-problem` : undefined}
                placeholder="e.g. Demo cleanup, not needed"
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 ${reasonProblem ? "border-danger/50" : "border-border"}`} />
              {reasonProblem && <p id={`${reasonId}-problem`} className="mt-1 text-xs text-danger">{reasonProblem}</p>}
            </div>

            <p className="text-xs text-muted-foreground">
              Excluded records stop taking part in duplicate checks. Registered employees still count. You can put any record back later from its row.
            </p>
          </>
        )}

        {confirm.error && (
          <p role="alert" className="text-xs text-danger">
            {(confirm.error as Error).message}{" "}
            {stale && (
              <Button variant="ghost" type="button" className="font-medium underline h-auto whitespace-normal" onClick={() => { confirm.reset(); void preview.refetch(); }}>
                Review again
              </Button>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal">
            Keep records
          </Button>
          <Button variant="ghost" type="button" disabled={!canConfirm || stale} onClick={() => data && confirm.mutate(data.token)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-danger-foreground hover:bg-danger disabled:opacity-40 h-auto whitespace-normal">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            {data ? `Exclude ${plural(data.toExclude, "record")}` : "Exclude"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
