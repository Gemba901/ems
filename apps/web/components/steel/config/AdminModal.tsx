"use client";

import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

export function AdminModal({
  title,
  onClose,
  onSubmit,
  submitting,
  submitLabel = "Save",
  error,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  submitLabel?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg bg-background shadow-xl border border-input p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>
        )}

        <div className="space-y-3">{children}</div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function FormLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground block mb-1">{children}</label>;
}
