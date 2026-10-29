import type { ReactNode } from "react";
export interface DetailListProps {
  items: { label: string; value: ReactNode }[];
  emptyLabel?: string;
}
export function DetailList({
  items,
  emptyLabel = "Not provided",
}: DetailListProps) {
  return (
    <dl className="divide-y divide-border">
      {items.map((item, i) => (
        <div key={i} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="text-body text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words text-body sm:col-span-2">
            {item.value === null ||
            item.value === undefined ||
            item.value === ""
              ? emptyLabel
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
