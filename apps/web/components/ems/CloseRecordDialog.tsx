"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * Closing a record with unsaved edits: Save & close, Discard, or Keep editing.
 * "Keep editing" is the safe choice: it has focus first, and Escape or a click outside picks it.
 */
export default function CloseRecordDialog({ open, name, saving, canSave, onSaveAndClose, onDiscard, onKeepEditing }: {
  open: boolean;
  name: string;
  saving: boolean;
  /** False while a department HOD change is unsaved: that change is saved separately. */
  canSave: boolean;
  onSaveAndClose: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  const titleId = useId();
  const keep = useRef<HTMLButtonElement>(null);

  if (!open) return null;
  const button = "rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onKeepEditing(); }}>
      <DialogContent showCloseButton={false} initialFocus={keep} role="alertdialog" aria-labelledby={titleId} data-close-record-dialog className="w-full max-w-md space-y-4 rounded-2xl bg-card p-5 shadow-xl sm:max-w-md gap-0 ring-0">
        <h2 id={titleId} className="text-base font-semibold text-foreground">Close {name} with unsaved edits?</h2>
        {!canSave && <p className="text-sm text-warning">Save or discard the department HOD change first, or discard everything.</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" ref={keep} type="button" disabled={saving} onClick={onKeepEditing} className={`h-auto whitespace-normal ${button} border border-border text-foreground hover:bg-muted`}>Keep editing</Button>
          <Button variant="ghost" type="button" disabled={saving} onClick={onDiscard} className={`h-auto whitespace-normal ${button} border border-danger/30 text-danger hover:bg-danger-subtle`}>Discard</Button>
          <Button variant="ghost" type="button" disabled={saving || !canSave} onClick={onSaveAndClose} className={`h-auto whitespace-normal ${button} bg-info text-info-foreground hover:bg-info`}>{saving ? "Saving…" : "Save & close"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
