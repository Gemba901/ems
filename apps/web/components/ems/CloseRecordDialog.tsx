"use client";

import { useEffect, useId, useRef } from "react";

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

  useEffect(() => {
    if (!open) return;
    keep.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) { event.preventDefault(); onKeepEditing(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onKeepEditing]);

  if (!open) return null;
  const button = "rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" onClick={() => { if (!saving) onKeepEditing(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-close-record-dialog
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
        <h2 id={titleId} className="text-base font-semibold text-slate-900">Close {name} with unsaved edits?</h2>
        {!canSave && <p className="text-sm text-amber-800">Save or discard the department HOD change first, or discard everything.</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={keep} type="button" disabled={saving} onClick={onKeepEditing} className={`${button} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Keep editing</button>
          <button type="button" disabled={saving} onClick={onDiscard} className={`${button} border border-red-200 text-red-700 hover:bg-red-50`}>Discard</button>
          <button type="button" disabled={saving || !canSave} onClick={onSaveAndClose} className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>{saving ? "Saving…" : "Save & close"}</button>
        </div>
      </div>
    </div>
  );
}
