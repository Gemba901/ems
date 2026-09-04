import { TaskStatus } from 'db';

export function calculateDoneTaskMetrics(
  tasks: ReadonlyArray<{ status: TaskStatus }>,
) {
  const total = tasks.length;
  const completed = tasks.filter(
    (task) => task.status === TaskStatus.DONE,
  ).length;

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
