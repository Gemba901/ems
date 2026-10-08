import type {
  DwmsDashboardMetrics,
  DwmsTaskCategory,
} from '@/services/dwms.service';
import { getCompletionRate } from './completionRate';

export const performanceKpiGroups = [
  {
    key: 'alerts', label: 'Alerts', metrics: [
      { key: 'alertCount', label: 'Number of Alerts', direction: 'asc', format: 'count' },
      { key: 'alertAcknowledgement', label: 'Acknowledgement Time', direction: 'asc', format: 'duration' },
    ],
  },
  {
    key: 'abnormalities', label: 'Abnormalities', metrics: [
      { key: 'abnormalityCount', label: 'Number of Abnormalities', direction: 'asc', format: 'count' },
      { key: 'abnormalityAcknowledgement', label: 'Acknowledgement Time', direction: 'asc', format: 'duration' },
    ],
  },
  {
    key: 'goodPractices', label: 'Good Practices', metrics: [
      { key: 'goodPracticePending', label: 'Pending', direction: 'asc', format: 'count' },
      { key: 'goodPracticeCompleted', label: 'Completed', direction: 'desc', format: 'count' },
      { key: 'goodPracticeOverdue', label: 'Overdue', direction: 'asc', format: 'count' },
      { key: 'goodPracticeCompletionRate', label: 'Completion Rate', direction: 'desc', format: 'percent' },
    ],
  },
  {
    key: 'jobResponsibilities', label: 'Job Responsibility', metrics: [
      { key: 'jobResponsibilityPending', label: 'Pending', direction: 'asc', format: 'count' },
      { key: 'jobResponsibilityCompleted', label: 'Completed', direction: 'desc', format: 'count' },
      { key: 'jobResponsibilityOverdue', label: 'Overdue', direction: 'asc', format: 'count' },
      { key: 'jobResponsibilityCompletionRate', label: 'Completion Rate', direction: 'desc', format: 'percent' },
    ],
  },
  {
    key: 'assignedTasks', label: 'Assigned Tasks', metrics: [
      { key: 'assignedTaskNotAcknowledged', label: 'Not Acknowledged', direction: 'asc', format: 'count' },
      { key: 'assignedTaskPending', label: 'Pending', direction: 'asc', format: 'count' },
      { key: 'assignedTaskCompleted', label: 'Completed', direction: 'desc', format: 'count' },
      { key: 'assignedTaskOverdue', label: 'Overdue', direction: 'asc', format: 'count' },
      { key: 'assignedTaskCompletionRate', label: 'Completion Rate', direction: 'desc', format: 'percent' },
    ],
  },
  {
    key: 'allTasks', label: 'All Tasks', metrics: [
      { key: 'allTasksCompletionRate', label: 'Completion Rate', direction: 'desc', format: 'percent' },
    ],
  },
] as const;

export type PerformanceKpiGroupKey = (typeof performanceKpiGroups)[number]['key'];
export type PerformanceKpiKey = (typeof performanceKpiGroups)[number]['metrics'][number]['key'];
export type PerformanceSortDirection = 'asc' | 'desc';

export const performanceKpis = performanceKpiGroups.flatMap((group) =>
  group.metrics.map((metric) => ({ ...metric, groupKey: group.key })),
);

export function getPerformanceKpi(key: PerformanceKpiKey) {
  return performanceKpis.find((kpi) => kpi.key === key)!;
}

export function getPerformanceKpiGroup(key: PerformanceKpiGroupKey) {
  return performanceKpiGroups.find((group) => group.key === key)!;
}

export function getPerformanceKpiGroupForMetric(key: PerformanceKpiKey) {
  return getPerformanceKpi(key).groupKey;
}

function categoryValue(
  metrics: DwmsDashboardMetrics,
  category: DwmsTaskCategory,
  field: 'pending' | 'completed' | 'overdue' | 'notAcknowledged' | 'completionRate',
) {
  if (field === 'completionRate') {
    return metrics.taskCategoryMetrics?.[category]?.completionRate
      ?? metrics.completionRateByCategory?.[category]
      ?? null;
  }
  return metrics.taskCategoryMetrics?.[category]?.[field] ?? null;
}

export function getPerformanceKpiValue(metrics: DwmsDashboardMetrics, key: PerformanceKpiKey): number | null {
  switch (key) {
    case 'alertCount': return metrics.alertsCount ?? null;
    case 'alertAcknowledgement': return metrics.alertAcknowledgementTimeMin ?? null;
    case 'abnormalityCount': return metrics.abnormalitiesCount ?? null;
    case 'abnormalityAcknowledgement': return metrics.abnormalityAcknowledgementTimeMin ?? null;
    case 'goodPracticePending': return categoryValue(metrics, 'GOOD_PRACTICE', 'pending');
    case 'goodPracticeCompleted': return categoryValue(metrics, 'GOOD_PRACTICE', 'completed');
    case 'goodPracticeOverdue': return categoryValue(metrics, 'GOOD_PRACTICE', 'overdue');
    case 'goodPracticeCompletionRate': return categoryValue(metrics, 'GOOD_PRACTICE', 'completionRate');
    case 'jobResponsibilityPending': return categoryValue(metrics, 'JOB_RESPONSIBILITY', 'pending');
    case 'jobResponsibilityCompleted': return categoryValue(metrics, 'JOB_RESPONSIBILITY', 'completed');
    case 'jobResponsibilityOverdue': return categoryValue(metrics, 'JOB_RESPONSIBILITY', 'overdue');
    case 'jobResponsibilityCompletionRate': return categoryValue(metrics, 'JOB_RESPONSIBILITY', 'completionRate');
    case 'assignedTaskNotAcknowledged': return categoryValue(metrics, 'ASSIGNED_TASK', 'notAcknowledged');
    case 'assignedTaskPending': return categoryValue(metrics, 'ASSIGNED_TASK', 'pending');
    case 'assignedTaskCompleted': return categoryValue(metrics, 'ASSIGNED_TASK', 'completed');
    case 'assignedTaskOverdue': return categoryValue(metrics, 'ASSIGNED_TASK', 'overdue');
    case 'assignedTaskCompletionRate': return categoryValue(metrics, 'ASSIGNED_TASK', 'completionRate');
    case 'allTasksCompletionRate': return metrics.totalTasks === 0 ? null : getCompletionRate(metrics);
  }
}

export function isPerformancePercentage(key: PerformanceKpiKey) {
  return getPerformanceKpi(key).format === 'percent';
}

export function formatPerformanceKpiValue(value: number | null, key: PerformanceKpiKey): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const format = getPerformanceKpi(key).format;
  if (format === 'percent') return `${value}%`;
  if (format === 'duration') {
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
