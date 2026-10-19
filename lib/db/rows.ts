/** One page of a query: what a Supabase builder resolves to. */
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE = 1000;

/**
 * Every row a query matches, a page at a time. PostgREST answers at most
 * 1,000 rows per request whatever .limit() asks for, so a longer list is read
 * with .range() until a short page. `max` keeps a runaway query bounded.
 */
export async function allRows<T>(page: (from: number, to: number) => Page<T>, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
