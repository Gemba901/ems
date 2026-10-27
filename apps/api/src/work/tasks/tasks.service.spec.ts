import { TasksService } from './tasks.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkAccessService } from '../work-access.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';

// Exercise both the preflight check and the atomic update guard: only the latter
// protects two writers that loaded the same task version.
describe('task edit conflicts', () => {
  const user = {} as AccessTokenPayload;
  function setup(version: number, count: number) {
    const tx = {
      workTask: { updateMany: jest.fn().mockResolvedValue({ count }) },
      workTaskActivity: { create: jest.fn() },
    };
    const prisma = {
      workTask: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'task',
            projectId: 'project',
            version,
            title: 'Original',
            status: 'TODO',
            priority: 'MEDIUM',
          }),
      },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const access = {
      resolveActor: jest
        .fn()
        .mockResolvedValue({ employeeId: 'employee', organizationId: 'org' }),
      getProjectAccess: jest.fn().mockResolvedValue({ canManage: true }),
    };
    return {
      service: new TasksService(
        prisma as unknown as PrismaService,
        access as unknown as WorkAccessService,
      ),
      prisma,
      tx,
    };
  }
  it('rejects an already stale draft without writing', async () => {
    const { service, prisma } = setup(2, 1);
    await expect(
      service.update(user, 'task', { expectedVersion: 1, title: 'Changed' }),
    ).rejects.toMatchObject({
      response: { code: 'VERSION_CONFLICT', statusCode: 409 },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a competing write without recording activity', async () => {
    const { service, tx } = setup(1, 0);
    await expect(
      service.update(user, 'task', { expectedVersion: 1, title: 'Changed' }),
    ).rejects.toMatchObject({
      response: { code: 'VERSION_CONFLICT', statusCode: 409 },
    });
    expect(tx.workTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'task', version: 1 } }),
    );
    expect(tx.workTaskActivity.create).not.toHaveBeenCalled();
  });
});
