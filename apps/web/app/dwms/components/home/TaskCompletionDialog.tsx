"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useId, useRef, type FormEvent } from "react";
import { Check, Upload } from "lucide-react";

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
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader className="pr-8">
          <DialogTitle>Complete task</DialogTitle>
          <DialogDescription>
            {required ? "Attach the required file to complete this task." : "You can attach supporting evidence for this task."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} aria-busy={saving} className="space-y-4">
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-semibold text-foreground">
              {task.completionDocumentName || "Completion file"}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-3 py-4 sm:px-4">
            <Upload
              className="h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="break-all text-sm font-medium text-foreground">
                {file ? file.name : "No file attached"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {file
                  ? "Attached and ready to submit"
                  : "Choose your completed file"}
              </p>
            </div>
            <Button
              variant="ghost"
              type="button"
              onClick={() => input.current?.click()}
              disabled={saving}
              className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {file ? "Replace" : "Choose file"}
            </Button>
            <Input
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
            className="mb-2 block text-xs font-semibold text-foreground"
          >
            Completion note{" "}
            <span className="font-normal text-muted-foreground">· Optional</span>
          </label>
          <Textarea
            id={`${id}-note`}
            value={note}
            disabled={saving}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            className="w-full resize-y rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-info focus:outline-none focus:ring-2 focus:ring-info"
            placeholder="Add a brief update for the approver…"
          />
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted px-5 py-3 sm:px-6">
            <Button
              variant="ghost"
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || (required && !file)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-success px-4 text-xs font-semibold text-success-foreground hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {saving ? "Uploading…" : "Mark done"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
