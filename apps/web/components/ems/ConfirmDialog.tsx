"use client";

import { useEffect, useId, useRef } from "react";

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

  // Start on the safe button, and let Escape close the dialog.
  useEffect(() => {
    if (!open) return;
    keepButton.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            ref={keepButton}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${
              tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
