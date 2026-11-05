/** Retry only errors which establish that PostgreSQL aborted the transaction.
 * Never retry timeouts, disconnected/uncertain commits or HR review conflicts.
 * Callbacks must contain database work only; send notifications after commit.
 */
export function isRetryableOnboardingConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const meta = error.meta;
  return !!meta && typeof meta === 'object' && 'code' in meta
    && (meta.code === '40001' || meta.code === '40P01');
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
