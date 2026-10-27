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
    "w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm",
    onClick &&
      "cursor-pointer transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
    className,
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className={classes}>{children}</button>;
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
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1 break-words text-sm text-slate-700">{children}</div>
    </div>
  );
}
