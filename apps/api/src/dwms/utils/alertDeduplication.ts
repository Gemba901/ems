type ScheduledTaskInstance = {
  id: string;
};

export function taskInstanceDelayAlertKey(instance: ScheduledTaskInstance) {
  return `dwms:task-instance-overdue:${instance.id}`;
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
