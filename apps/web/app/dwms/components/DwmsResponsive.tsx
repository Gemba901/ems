import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DwmsPageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DwmsResponsiveToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DwmsMobileDataCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const classes = cn(
    "w-full min-w-0 rounded-2xl border border-border bg-card p-4 text-left shadow-sm",
    onClick &&
      "cursor-pointer transition hover:border-info hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info",
    className,
  );

  if (onClick) {
    return <Button variant="ghost" type="button" onClick={onClick} className={classes}>{children}</Button>;
  }

  return <article className={classes}>{children}</article>;
}

export function DwmsDataField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 break-words text-sm text-foreground">{children}</div>
    </div>
  );
}
