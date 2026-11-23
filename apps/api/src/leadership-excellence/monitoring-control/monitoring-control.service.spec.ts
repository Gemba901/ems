import { PrismaService } from 'src/prisma/prisma.service';
import { MonitoringControlService } from './monitoring-control.service';

describe('MonitoringControlService (provider for Areas 06 / 07)', () => {
  it('returns only this company’s official results, oldest first, as plain numbers', async () => {
    const target = {
      periodId: 'p-sep',
      start: '2026-09-01',
      end: '2026-09-30',
      scheduled: true,
      dueAt: '',
      value: 108,
    };
    const findMany = jest.fn(async () => [
      {
        assignmentId: 'kpi-1',
        periodId: 'p-sep',
        periodStart: new Date('2026-09-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-30T00:00:00.000Z'),
        actual: '110.500000', // Prisma.Decimal at runtime; Number() handles both
        snapshot: { target, assignment: {} },
        verifiedById: 'emp-verifier',
        verifiedAt: new Date('2026-10-03T10:00:00.000Z'),
        revision: 2,
      },
    ]);
    const service = new MonitoringControlService({
      lexOfficialResult: { findMany },
    } as unknown as PrismaService);

    const rows = await service.getOfficialResults('org-1', 'kpi-1');
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', assignmentId: 'kpi-1' },
      orderBy: { periodStart: 'asc' },
    });
    expect(rows).toEqual([
      {
        assignmentId: 'kpi-1',
        periodId: 'p-sep',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        actual: 110.5,
        target,
        verifiedById: 'emp-verifier',
        verifiedAt: new Date('2026-10-03T10:00:00.000Z'),
        revision: 2,
      },
    ]);
  });
});
