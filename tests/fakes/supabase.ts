/**
 * An in-memory stand-in for the Supabase client, covering the query shapes
 * the scan uses: select with eq/gte/in/is/order/range/limit, maybeSingle,
 * insert, upsert (onConflict, ignoreDuplicates) with select, update, delete.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export class FakeDb {
  tables = new Map<string, Row[]>();
  rows(t: string): Row[] {
    if (!this.tables.has(t)) this.tables.set(t, []);
    return this.tables.get(t)!;
  }
  from(t: string) {
    return new Query(this, t);
  }
  /** Database functions not yet created (a migration not applied) answer like PostgREST's missing function. */
  missing = new Set<string>();
  /** The SQL functions in supabase/setup.sql, each as one atomic step like its transaction. */
  async rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
    if (this.missing.has(fn) || fn !== "take_preview_slot") return { data: null, error: { message: `Could not find the function public.${fn}` } };
    const { p_visitor, p_day, p_per_visitor, p_budget } = args as { p_visitor: string; p_day: string; p_per_visitor: number; p_budget: number };
    const hits = this.rows("preview_hits");
    const row = (key: string) => hits.find((r) => r.key === key && r.day === p_day) ?? (hits.push({ key, day: p_day, count: 0 }), hits[hits.length - 1]);
    const all = row("all");
    const visitor = row(p_visitor);
    if ((all.count as number) >= p_budget) return { data: "budget", error: null };
    if ((visitor.count as number) >= p_per_visitor) return { data: "visitor", error: null };
    all.count = (all.count as number) + 1;
    visitor.count = (visitor.count as number) + 1;
    return { data: "ok", error: null };
  }
}

class Query implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = [];
  private orders: [string, boolean][] = [];
  private window: [number, number] | null = null;
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] = [];
  private ignoreDup = false;
  private returning = false;
  private one = false;
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => r[k] === v);
    return this;
  }
  neq(k: string, v: unknown) {
    this.filters.push((r) => r[k] !== v);
    return this;
  }
  gte(k: string, v: string) {
    this.filters.push((r) => r[k] !== null && r[k] !== undefined && String(r[k]) >= v);
    return this;
  }
  in(k: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[k]));
    return this;
  }
  is(k: string, v: null) {
    this.filters.push((r) => (r[k] ?? null) === v);
    return this;
  }
  order(k: string, o: { ascending?: boolean } = {}) {
    this.orders.push([k, o.ascending ?? true]);
    return this;
  }
  range(a: number, b: number) {
    this.window = [a, b];
    return this;
  }
  limit(n: number) {
    this.window = [0, n - 1];
    return this;
  }
  /** PostgREST's or=(...): comma-separated `col.op.value` with is.null and lt supported. */
  or(expr: string) {
    const parts = expr.split(",").map((t) => {
      const [k, op, ...rest] = t.split(".");
      const v = rest.join(".");
      return (r: Row) => (op === "is" && v === "null" ? (r[k] ?? null) === null : op === "lt" ? r[k] !== null && r[k] !== undefined && String(r[k]) < v : false);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = (o.onConflict ?? "id").split(",");
    this.ignoreDup = Boolean(o.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private run(): { data: unknown; error: null } {
    const all = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "insert") {
      out = this.payload.map((p) => ({ id: uuid(), created_at: new Date().toISOString(), ...p }));
      all.push(...out);
    } else if (this.op === "upsert") {
      for (const p of this.payload) {
        const hit = all.find((r) => this.conflict.every((k) => r[k] === p[k]));
        if (hit) {
          if (!this.ignoreDup) Object.assign(hit, p);
          if (!this.ignoreDup) out.push(hit);
        } else {
          const row = { id: uuid(), created_at: new Date().toISOString(), ...p };
          all.push(row);
          out.push(row);
        }
      }
    } else if (this.op === "update") {
      out = all.filter(match);
      out.forEach((r) => Object.assign(r, this.patch));
    } else if (this.op === "delete") {
      const keep = all.filter((r) => !match(r));
      out = all.filter(match);
      all.splice(0, all.length, ...keep);
    } else {
      out = all.filter(match);
      for (const [k, asc] of [...this.orders].reverse()) out = [...out].sort((a, b) => (String(a[k] ?? "") < String(b[k] ?? "") ? -1 : String(a[k] ?? "") > String(b[k] ?? "") ? 1 : 0) * (asc ? 1 : -1));
      if (this.window) out = out.slice(this.window[0], this.window[1] + 1);
    }
    const rows = out.map((r) => ({ ...r }));
    if (this.one) return { data: rows[0] ?? null, error: null };
    return { data: this.op === "select" || this.returning ? rows : null, error: null };
  }
  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}
