import { TaskStatus } from 'db';

export const taskStatusCompletion: Record<TaskStatus, number> = {
  PENDING: 0,
  IN_PROGRESS: 20,
  LESS_THAN_50: 10,
  PARTLY_DONE: 50,
  DONE: 100,
  APPROVAL_PENDING: 100,
  NOT_APPLICABLE: 0,
  OVERDUE: 0,
};

export function getTaskStatusCompletion(status: TaskStatus): number {
  return taskStatusCompletion[status];
}
