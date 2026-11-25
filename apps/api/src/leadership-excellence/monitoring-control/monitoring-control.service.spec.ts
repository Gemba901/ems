import type { ExecutionProvider, OfficialValue } from '../common/contracts';
import { MonitoringControlService } from './monitoring-control.service';

describe('MonitoringControlService (provider for Areas 06 / 07)', () => {
  it('passes on Area 04 official values for one KPI, oldest first', async () => {
    const target = {
      periodId: 'p-sep',
      start: '2026-09-01',
      end: '2026-09-30',
      scheduled: true,
      dueAt: '',
      value: 108,
    };
    const row = (
      periodId: string,
      start: string,
      end: string,
      actual: number,
    ) =>
      ({
        submissionId: `r-${periodId}`,
        assignmentId: 'kpi-1',
        periodId,
        periodStart: start,
        periodEnd: end,
        actual,
        inputA: null,
        inputB: null,
        evidence: 'report',
        target: { ...target, periodId, start, end },
        verifiedById: 'emp-verifier',
        verifiedAt: new Date('2026-10-03T10:00:00.000Z'),
        revision: 2,
      }) satisfies OfficialValue;
    const listOfficial = jest.fn(async () => [
      row('p-sep', '2026-09-01', '2026-09-30', 110.5),
      row('p-aug', '2026-08-01', '2026-08-31', 100),
    ]);
    const service = new MonitoringControlService({
      listOfficial,
    } as unknown as ExecutionProvider);

    const rows = await service.getOfficialResults('org-1', 'kpi-1');
    expect(listOfficial).toHaveBeenCalledWith('org-1', ['kpi-1']);
    expect(rows.map((r) => r.periodId)).toEqual(['p-aug', 'p-sep']);
    expect(rows[1]).toEqual({
      assignmentId: 'kpi-1',
      periodId: 'p-sep',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      actual: 110.5,
      target: { ...target },
      verifiedById: 'emp-verifier',
      verifiedAt: new Date('2026-10-03T10:00:00.000Z'),
      revision: 2,
    });
  });
});
