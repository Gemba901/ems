import { toIsoDate } from './taskSchedule';

type ScheduledTaskInstance = {
  taskId: string;
  scheduledFor: Date;
};

export function taskInstanceDelayAlertKey(instance: ScheduledTaskInstance) {
  return `dwms:task-delay:${instance.taskId}:${toIsoDate(instance.scheduledFor)}`;
}

export function taskDelayAlertKey(
  taskId: string,
  reason: 'overdue' | 'unacknowledged',
) {
  return `dwms:task-delay:${taskId}:${reason}`;
}

export function repeatedOverdueAbnormalityKey(
  taskId: string,
  ownerId: string,
) {
  return `dwms:repeated-overdue:${taskId}:${ownerId}`;
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
