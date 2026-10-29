import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}
export function EmptyState({
  title = "No records yet",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="grid justify-items-center gap-3 p-card text-center">
      <Inbox aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="font-semibold">{title}</p>
      {description && (
        <p className="text-body text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}
