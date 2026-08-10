"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QueryErrorState({
  onRetry,
  isRetrying,
  message = "Could not load this data.",
}: {
  onRetry: () => void;
  isRetrying?: boolean;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <AlertTriangle className="h-4 w-4 text-red-500" />
      <p className="text-xs text-slate-500">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Retry"}
      </Button>
    </div>
  );
}
