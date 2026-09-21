import type { DwmsDashboardMetrics } from '@/services/dwms.service';
import { getCompletionRate } from './completionRate';

export const performanceKpis = [
  { key: 'allTasks', label: 'All Tasks', direction: 'desc' },
  { key: 'completed', label: 'Completed', direction: 'desc' },
  { key: 'notCompleted', label: 'Not Completed', direction: 'asc' },
  { key: 'overdue', label: 'Overdue', direction: 'asc' },
  { key: 'alerts', label: 'Alerts', direction: 'asc' },
  { key: 'completionRate', label: 'Completion Rate', direction: 'desc' },
  { key: 'completedOnTime', label: 'Completed on Time', direction: 'desc' },
  { key: 'acknowledgement', label: 'Avg. Acknowledgement', direction: 'asc' },
] as const;

export type PerformanceKpiKey = (typeof performanceKpis)[number]['key'];
export type PerformanceSortDirection = 'asc' | 'desc';

export function getPerformanceKpi(key: PerformanceKpiKey) {
  return performanceKpis.find((kpi) => kpi.key === key)!;
}

export function getPerformanceKpiValue(metrics: DwmsDashboardMetrics, key: PerformanceKpiKey): number | null {
  const completed = metrics.completedTasks ?? metrics.completedCount;

  switch (key) {
    case 'allTasks': return metrics.totalTasks ?? null;
    case 'completed': return completed ?? null;
    case 'notCompleted':
      return metrics.totalTasks == null || completed == null
        ? null
        : Math.max(0, metrics.totalTasks - completed);
    case 'overdue': return metrics.overdueTasks ?? metrics.overdueCount ?? null;
    case 'alerts': return metrics.alertsCount ?? null;
    case 'completionRate': return metrics.totalTasks === 0 ? null : getCompletionRate(metrics);
    case 'completedOnTime': return metrics.completedOnTimeRate ?? null;
    case 'acknowledgement': return metrics.avgAcknowledgeTimeMin ?? null;
  }
}

export function formatPerformanceKpiValue(value: number | null, key: PerformanceKpiKey): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (key === 'completionRate' || key === 'completedOnTime') return `${value}%`;
  if (key === 'acknowledgement') {
    return value >= 60 ? `${(value / 60).toFixed(1)} hrs` : `${Math.round(value)} min`;
  }
  return value.toLocaleString();
}

export function comparePerformanceKpi(
  a: DwmsDashboardMetrics & { name: string },
  b: DwmsDashboardMetrics & { name: string },
  key: PerformanceKpiKey,
  direction: PerformanceSortDirection = getPerformanceKpi(key).direction,
): number {
  const aValue = getPerformanceKpiValue(a, key);
  const bValue = getPerformanceKpiValue(b, key);
  const aMissing = aValue == null || !Number.isFinite(aValue);
  const bMissing = bValue == null || !Number.isFinite(bValue);
  if (aMissing || bMissing) {
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    return a.name.localeCompare(b.name);
  }
  const difference = direction === 'desc'
    ? bValue - aValue
    : aValue - bValue;
  return difference || a.name.localeCompare(b.name);
}
