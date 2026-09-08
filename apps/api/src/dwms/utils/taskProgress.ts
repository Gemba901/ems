import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from 'db';

const order: Record<TaskStatus, number> = {
  PENDING: 0,
  OVERDUE: 0,
  IN_PROGRESS: 1,
  LESS_THAN_50: 2,
  PARTLY_DONE: 3,
  DONE: 4,
  NOT_APPLICABLE: 4,
  APPROVAL_PENDING: 4,
};

export function resolveTaskProgress(
  current: TaskStatus,
  next: TaskStatus,
  percent?: number,
): number {
  if (
    current === TaskStatus.DONE ||
    current === TaskStatus.NOT_APPLICABLE ||
    current === TaskStatus.APPROVAL_PENDING
  ) {
    throw new BadRequestException(
      'Completed tasks and tasks pending approval cannot be modified',
    );
  }
  if (next === TaskStatus.APPROVAL_PENDING || next === TaskStatus.OVERDUE) {
    throw new BadRequestException('This status is managed by the system');
  }
  if (order[next] === undefined || order[next] < order[current]) {
    throw new BadRequestException(
      `Cannot transition back from ${current} to ${next}`,
    );
  }
  if (
    percent !== undefined &&
    (!Number.isInteger(percent) || percent < 0 || percent > 100)
  ) {
    throw new BadRequestException(
      'Completion percentage must be an integer between 0 and 100',
    );
  }
  if (next === TaskStatus.DONE) return 100;
  if (next === TaskStatus.PENDING || next === TaskStatus.NOT_APPLICABLE)
    return 0;
  return (
    percent ?? { IN_PROGRESS: 20, LESS_THAN_50: 10, PARTLY_DONE: 50 }[next] ?? 0
  );
}
