"use client";

import { useId, useRef, type FormEvent } from "react";
import { Check, Upload, X } from "lucide-react";

type TaskCompletionDialogProps = {
  task: {
    requiresCompletionDocument?: boolean;
    completionDocumentName?: string | null;
  };
  note: string;
  file: File | null;
  error: string | null;
  saving: boolean;
  onNoteChange: (note: string) => void;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function TaskCompletionDialog({
  task,
  note,
  file,
  error,
  saving,
  onNoteChange,
  onFileChange,
  onClose,
  onSubmit,
}: TaskCompletionDialogProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const required = Boolean(task.requiresCompletionDocument);
  return (
    <div
      className="dwms-dialog-backdrop fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-requirement`}
        className="dwms-dialog-panel w-full max-w-[470px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) onClose();
        }}
      >
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              id={`${id}-title`}
              className="text-lg font-semibold text-slate-900"
            >
              Complete task
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close completion dialog"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div
            id={`${id}-requirement`}
            className="mb-4 rounded-xl bg-slate-50 px-3 py-3 text-sm"
          >
            <p className="font-semibold text-slate-800">
              {task.completionDocumentName || "Completion file"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {required
                ? "Attach the required file to complete this task."
                : "Attach a file if you have supporting evidence. This is optional."}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-4 sm:px-4">
            <Upload
              className="h-5 w-5 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="break-all text-sm font-medium text-slate-800">
                {file ? file.name : "No file attached"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {file
                  ? "Attached and ready to submit"
                  : "Choose your completed file"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={saving}
              className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {file ? "Replace" : "Choose file"}
            </button>
            <input
              ref={input}
              type="file"
              aria-label={
                task.completionDocumentName
                  ? `Upload ${task.completionDocumentName}`
                  : "Completion file"
              }
              aria-required={required}
              disabled={saving}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) =>
                onFileChange(event.target.files?.[0] ?? null)
              }
            />
          </div>
          <label
            htmlFor={`${id}-note`}
            className="mb-2 block text-xs font-semibold text-slate-700"
          >
            Completion note{" "}
            <span className="font-normal text-slate-500">· Optional</span>
          </label>
          <textarea
            id={`${id}-note`}
            value={note}
            disabled={saving}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Add a brief update for the approver…"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (required && !file)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? "Uploading…" : "Mark done"}
          </button>
        </div>
      </form>
    </div>
  );
}
