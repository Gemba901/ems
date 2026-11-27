"use client";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { statusToTone } from "@/lib/status";
export interface StatusBadgeProps extends Omit<
  ComponentProps<typeof Badge>,
  "variant" | "children"
> {
  status?: string | null;
  label?: string;
}
export function StatusBadge({ status, label, ...props }: StatusBadgeProps) {
  const text = status?.trim().replaceAll("_", " ").toLowerCase();
  return (
    <Badge {...props} variant={statusToTone(status)}>
      {label ??
        (text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown")}
    </Badge>
  );
}
