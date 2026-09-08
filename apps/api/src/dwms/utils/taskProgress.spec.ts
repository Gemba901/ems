import { TaskStatus } from 'db';
import { resolveTaskProgress } from './taskProgress';

describe('DWMS progress rules', () => {
  it.each([
    TaskStatus.DONE,
    TaskStatus.APPROVAL_PENDING,
    TaskStatus.NOT_APPLICABLE,
  ])('locks %s tasks', (status) => {
    expect(() => resolveTaskProgress(status, TaskStatus.IN_PROGRESS)).toThrow(
      'cannot be modified',
    );
  });
  it.each([TaskStatus.APPROVAL_PENDING, TaskStatus.OVERDUE])(
    'rejects client assignment of %s',
    (status) => {
      expect(() => resolveTaskProgress(TaskStatus.PENDING, status)).toThrow(
        'managed by the system',
      );
    },
  );
  it('allows progress from less than 50 percent to partly done', () => {
    expect(
      resolveTaskProgress(TaskStatus.LESS_THAN_50, TaskStatus.PARTLY_DONE),
    ).toBe(50);
  });
  it('rejects backward status transitions', () => {
    expect(() =>
      resolveTaskProgress(TaskStatus.PARTLY_DONE, TaskStatus.PENDING),
    ).toThrow('Cannot transition back');
  });
  it.each([-1, 101, 1.5, NaN, Infinity])(
    'rejects invalid percentages (%s)',
    (percent) => {
      expect(() =>
        resolveTaskProgress(
          TaskStatus.PENDING,
          TaskStatus.IN_PROGRESS,
          percent,
        ),
      ).toThrow('integer');
    },
  );
  it('always records completed work as 100 percent', () => {
    expect(
      resolveTaskProgress(TaskStatus.IN_PROGRESS, TaskStatus.DONE, 10),
    ).toBe(100);
  });
  it('preserves a supplied progress percentage', () => {
    expect(
      resolveTaskProgress(TaskStatus.PENDING, TaskStatus.IN_PROGRESS, 35),
    ).toBe(35);
  });
});
