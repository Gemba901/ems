import { TaskStatus } from 'db';
import { getTaskStatusCompletion } from './taskCompletion';

export function calculateDoneTaskMetrics(
  tasks: ReadonlyArray<{ status: TaskStatus }>,
) {
  const total = tasks.length;
  const completed = tasks.filter(
    (task) => task.status === TaskStatus.DONE,
  ).length;
  const completionTotal = tasks.reduce(
    (sum, task) => sum + getTaskStatusCompletion(task.status),
    0,
  );

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round(completionTotal / total) : 0,
  };
}
