import {
  actionHasExecutionRecords,
  executionActionProgress,
} from './planning-execution';

describe('planning handover to execution', () => {
  const update = {
    actionKey: 'production/action/setup',
    status: 'PENDING_CHECK',
    progress: 100,
    note: 'Setup completed; awaiting check',
    evidence: 'Signed shift log',
    delayReason: '',
    updatedAt: '2026-11-18T10:00:00Z',
    updatedBy: 'operator',
    history: [],
  };
  it('keeps pending completion provisional in the old planning action card', () => {
    expect(
      executionActionProgress({ actionUpdates: [update] })[0],
    ).toMatchObject({
      documentId: 'production',
      actionId: 'setup',
      status: 'IN_PROGRESS',
      evidence: 'Signed shift log',
      updatedBy: 'operator',
    });
    expect(
      executionActionProgress({
        actionUpdates: [{ ...update, status: 'COMPLETED' }],
      })[0].status,
    ).toBe('COMPLETED');
  });
  it('protects action history and support references without locking unrelated actions', () => {
    expect(
      actionHasExecutionRecords({ actionUpdates: [update] }, update.actionKey),
    ).toBe(true);
    expect(
      actionHasExecutionRecords(
        { supportRequests: [{ actionKey: update.actionKey }] },
        update.actionKey,
      ),
    ).toBe(true);
    expect(
      actionHasExecutionRecords(
        { actionUpdates: [update] },
        'quality/action/setup',
      ),
    ).toBe(false);
    expect(actionHasExecutionRecords(null, update.actionKey)).toBe(false);
  });
  it('treats an absent execution workspace as no recorded progress', () => {
    expect(executionActionProgress(null)).toEqual([]);
  });
});
