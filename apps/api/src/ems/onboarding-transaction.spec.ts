import { BadRequestException, ConflictException } from '@nestjs/common';
import { isRetryableOnboardingConflict, retryOnboardingTransaction } from './onboarding-transaction';

describe('onboarding transaction retries', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { code: '40P01' } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'postgres', code: '40P01', originalCode: '40P01' } } } },
  ])('retries an aborted conflict with fresh work: %j', async error => {
    const run = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('committed');
    await expect(retryOnboardingTransaction(run)).resolves.toBe('committed');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('stops after three failed attempts and preserves the final error', async () => {
    const error = { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40001' } } } };
    const run = jest.fn().mockRejectedValue(error);
    await expect(retryOnboardingTransaction(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each([
    { code: 'P2028' }, { code: 'P2002' }, { code: 'P1001' },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '55P03' } } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '23505' } } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '08006' } } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } } } },
    { code: 'P2010', meta: { driverAdapterError: null } },
    { code: 'P2010', meta: { driverAdapterError: { cause: null } } },
    { code: 'P2010', meta: null },
    { code: 'P2010', meta: { message: 'Raw query failed. Code: `40001`' } },
    { code: 'P2010', meta: { code: '55P03' } },
    { code: 'P2010', meta: { code: '23505' } },
    new BadRequestException('Correct the phone'), new ConflictException('Stale review'),
    new Error('Connection lost during commit'), null,
  ])('does not replay an uncertain or non-transaction failure: %j', async error => {
    const run = jest.fn().mockRejectedValue(error);
    await expect(retryOnboardingTransaction(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
    expect(isRetryableOnboardingConflict(error)).toBe(false);
  });

  it('does not multiply the wait after an already slow attempt', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(4000);
    const error = { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40001' } } } };
    const run = jest.fn().mockRejectedValue(error);
    await expect(retryOnboardingTransaction(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
