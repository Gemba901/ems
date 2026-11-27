"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * A confirmation box whose buttons say what they do, e.g. "Keep import" / "Cancel import".
 * Replaces the browser's confirm(), whose buttons are always the ambiguous "OK" / "Cancel".
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel, keepLabel, tone = "danger", busy = false, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;      // the action, e.g. "Cancel import"
  keepLabel: string;         // the safe choice, e.g. "Keep import"
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const keepButton = useRef<HTMLButtonElement>(null);

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} initialFocus={keepButton} role="alertdialog"
        aria-labelledby={titleId} className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl space-y-4 sm:max-w-md gap-0 ring-0">
        <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost"
            ref={keepButton}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 h-auto whitespace-normal"
          >
            {keepLabel}
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-auto whitespace-normal px-4 py-2 rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50 ${
              tone === "danger" ? "bg-danger hover:bg-danger" : "bg-info hover:bg-info"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
