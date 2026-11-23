import type { PrismaService } from 'src/prisma/prisma.service';
import type { ScheduledJobsService } from 'src/operations/scheduled-jobs.service';
import type { AlertsService } from './alerts.service';
import { AlertsSyncJob } from './alerts-sync.job';

describe('AlertsSyncJob', () => {
  const make = (fail: string[] = []) => {
    const findMany = jest.fn(() =>
      Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    );
    const prisma = { organization: { findMany } } as unknown as PrismaService;
    const run = jest.fn(
      async (_n: string, _w: string, work: () => Promise<unknown>) => {
        await work();
      },
    );
    const jobs = { run } as unknown as ScheduledJobsService;
    const sync = jest.fn((id: string) =>
      fail.includes(id)
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([]),
    );
    const alerts = { sync } as unknown as AlertsService;
    return {
      job: new AlertsSyncJob(prisma, jobs, alerts),
      findMany,
      run,
      sync,
    };
  };

  it('syncs every active LEX organisation under one hourly lease', async () => {
    const { job, findMany, run, sync } = make();
    await job.syncAll();
    expect(run).toHaveBeenCalledWith(
      'lex05-alert-sync',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
      expect.any(Function),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', modules: { has: 'LEADERSHIP_EXCELLENCE' } },
      }),
    );
    expect(sync.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('one organisation failing does not stop the others', async () => {
    const { job, sync } = make(['b']);
    await expect(job.syncAll()).resolves.toBeUndefined();
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('does not start a second pass while one is running', async () => {
    const { job, run } = make();
    await Promise.all([job.syncAll(), job.syncAll()]);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
