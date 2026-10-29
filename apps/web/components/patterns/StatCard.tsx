import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export interface StatCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  trend?: { label: string; tone: "success" | "danger" | "neutral" };
  className?: string;
}
export function StatCard({
  label,
  value,
  description,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-card text-card-foreground",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-control">
        <p className="text-body text-muted-foreground">{label}</p>
        {icon && (
          <span aria-hidden="true" className="[&_svg]:size-6">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-page-title">{value}</p>
      {trend && (
        <p
          className={cn(
            "mt-1 text-caption",
            {
              success: "text-success",
              danger: "text-danger",
              neutral: "text-muted-foreground",
            }[trend.tone],
          )}
        >
          {trend.label}
        </p>
      )}
      {description && (
        <p className="text-caption text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
