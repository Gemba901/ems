import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  className?: string;
}
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("space-y-3", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap gap-control text-caption text-muted-foreground">
            {breadcrumbs.map((item, i) => (
              <li key={i}>
                {item.href && i !== breadcrumbs.length - 1 ? (
                  <a className="underline underline-offset-4" href={item.href}>
                    {item.label}
                  </a>
                ) : (
                  <span
                    aria-current={
                      i === breadcrumbs.length - 1 ? "page" : undefined
                    }
                  >
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title">{title}</h1>
          {description && (
            <p className="mt-1 text-body text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-control">{actions}</div>}
      </div>
    </header>
  );
}
