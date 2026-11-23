/** Retry only errors which establish that PostgreSQL aborted the transaction.
 * Never retry timeouts, disconnected/uncertain commits or HR review conflicts.
 * Callbacks must contain database work only; send notifications after commit.
 */
export function isRetryableOnboardingConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const meta = error.meta;
  if (!meta || typeof meta !== 'object') return false;
  const aborted = (code: unknown) => code === '40001' || code === '40P01';
  // Older Prisma raw-query errors expose the PostgreSQL SQLSTATE directly.
  if ('code' in meta && aborted(meta.code)) return true;
  // Prisma 7 driver adapters preserve SQLSTATE on the adapter error's cause.
  // Inspect structured fields only; never infer safe replay from message text.
  const adapter = 'driverAdapterError' in meta ? meta.driverAdapterError : undefined;
  if (!adapter || typeof adapter !== 'object' || !('cause' in adapter)) return false;
  const cause = adapter.cause;
  return !!cause && typeof cause === 'object' && 'originalCode' in cause
    && aborted(cause.originalCode);
}

export async function retryOnboardingTransaction<T>(run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      // Three attempts at most; don't repeat an operation which was already slow.
      if (!isRetryableOnboardingConflict(error) || attempt >= 2 || Date.now() - started >= 3000) throw error;
      const delay = 50 * 2 ** attempt + Math.floor(Math.random() * 25);
      await new Promise<void>(resolve => setTimeout(resolve, delay));
    }
  }
}
