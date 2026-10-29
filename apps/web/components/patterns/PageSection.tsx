import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
export interface PageSectionProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: PageSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-control">
        <div>
          <h2 id={id} className="text-section-title">
            {title}
          </h2>
          {description && (
            <p className="text-body text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
export function SectionCard(props: PageSectionProps) {
  return (
    <PageSection
      {...props}
      className={cn(
        "rounded-xl border border-border bg-card p-card text-card-foreground",
        props.className,
      )}
    />
  );
}
