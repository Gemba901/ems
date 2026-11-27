"use client";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}
export function ErrorState({
  title = "Unable to load records",
  description = "Please try again.",
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="grid justify-items-center gap-3 p-card text-center"
    >
      <CircleAlert aria-hidden="true" className="size-6 text-danger" />
      <p className="font-semibold">{title}</p>
      <p className="text-body text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" disabled={retrying} onClick={onRetry}>
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
