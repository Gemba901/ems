import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
export interface TimelineItem {
  id: string;
  title: string;
  dateTime: string;
  timeLabel: string;
  description?: ReactNode;
  actor?: string;
  icon?: ReactNode;
}
export function Timeline({
  items,
  label = "Activity history",
}: {
  items: TimelineItem[];
  label?: string;
}) {
  if (!items.length) return <EmptyState title="No activity yet" />;
  return (
    <ol aria-label={label} className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted [&_svg]:size-4"
          >
            {item.icon ?? <span className="size-2 rounded-full bg-primary" />}
          </span>
          <div className="min-w-0 text-body">
            <p className="font-medium">{item.title}</p>
            {item.actor && <p>{item.actor}</p>}
            <time
              dateTime={item.dateTime}
              className="text-caption text-muted-foreground"
            >
              {item.timeLabel}
            </time>
            {item.description && (
              <div className="mt-1 break-words text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
export { Timeline as ActivityFeed };
