import type { DwmsDashboardMetrics } from "@/services/dwms.service";

export function getCompletionRate(metrics: DwmsDashboardMetrics): number {
  const value = metrics.completionRate ?? metrics.tasksPerformedTodayPercent;
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}
