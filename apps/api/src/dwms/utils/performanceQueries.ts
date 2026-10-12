/** Start at most two reads, and drain the started batch before propagating failure. */
export async function runPerformanceQueries<
  const T extends readonly (() => PromiseLike<unknown>)[],
>(queries: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const values: unknown[] = [];
  for (let offset = 0; offset < queries.length; offset += 2) {
    const settled = await Promise.allSettled(
      queries
        .slice(offset, offset + 2)
        .map((query) => Promise.resolve().then(query)),
    );
    const failed = settled.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    for (const result of settled) {
      if (result.status === 'fulfilled') values.push(result.value);
    }
  }
  return values as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
