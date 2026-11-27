"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
export interface FormActionsProps {
  onCancel?: () => void;
  submitLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}
export function FormActions({
  onCancel,
  submitLabel = "Save changes",
  pending = false,
  disabled = false,
  children,
}: FormActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-control border-t border-border pt-4">
      {children}
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      )}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Saving…" : submitLabel}
      </Button>
      <span role="status" className="sr-only">
        {pending ? "Saving changes" : ""}
      </span>
    </div>
  );
}
