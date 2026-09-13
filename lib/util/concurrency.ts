/**
 * Run `fn` over `items` with at most `limit` in flight, results in input
 * order. A rejected item rejects the whole map, so callers that tolerate
 * failure catch inside `fn`. Optional `stop` is read before each start:
 * true leaves the rest unstarted (their results are `undefined`), which is
 * how a budgeted read stops taking on work when its time is spent.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  stop: () => boolean = () => false,
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  async function worker(): Promise<void> {
    while (next < items.length) {
      if (stop()) return;
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
  return out;
}
