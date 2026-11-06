import { paidPlanOf } from "@/lib/billing";

/**
 * The brief's funnel and retention numbers, from the event log and the
 * creators table. Pure: /admin reads the rows and hands them here.
 */

export interface EventRow {
  kind: string;
  creator_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface CreatorRow {
  id: string;
  plan: string;
  plan_status: string;
  created_at: string;
}

export interface Rate {
  n: number;
  of: number;
  /** n / of, 0-1; null when there is nothing to divide by. */
  rate: number | null;
}

const rate = (n: number, of: number): Rate => ({ n, of, rate: of ? n / of : null });
const DAY = 86_400_000;

export interface Metrics {
  /** Free handle → account created. */
  handleToAccount: Rate;
  /** Account → first plan viewed. */
  accountToPlan: Rate;
  /** First plan viewed → paid, overall and by tier. */
  planToPaid: Rate;
  paidByTier: Record<string, number>;
  /** Paying accounts by billing period. */
  mix: { month: number; year: number; legacy: number };
  /** Accounts at least 2 (4) weeks old that opened a plan in their second (fourth) week. */
  week2: Rate;
  week4: Rate;
  /** Accounts with a checked idea that opened a scorecard. */
  scorecard: Rate;
  /** Share cards saved per preview started. */
  share: Rate;
  /** Cancellations against paying-or-canceled, by plan. */
  churn: Record<string, Rate>;
}

export function metrics(events: EventRow[], creators: CreatorRow[], opts: { checked: Set<string>; days?: number; now?: number }): Metrics {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 30) * DAY;
  const recent = events.filter((e) => Date.parse(e.created_at) >= since);
  const of = (kind: string, list = recent) => list.filter((e) => e.kind === kind);
  const ids = (list: EventRow[]) => new Set(list.map((e) => e.creator_id).filter((x): x is string => Boolean(x)));

  const previews = new Set(of("preview_started").filter((e) => !e.meta?.blocked).map((e) => String(e.meta?.handle ?? "")));
  const created = of("account_created");
  const createdIds = ids(created);
  const viewedAll = ids(of("plan_viewed", events));
  const viewed = [...createdIds].filter((id) => viewedAll.has(id));
  const paid = of("paid");
  const paidByTier: Record<string, number> = {};
  for (const e of paid) {
    const tier = paidPlanOf(String(e.meta?.plan ?? ""))?.tier ?? "unknown";
    paidByTier[tier] = (paidByTier[tier] ?? 0) + 1;
  }

  const mix = { month: 0, year: 0, legacy: 0 };
  for (const c of creators) {
    const p = paidPlanOf(c.plan);
    if (!p || !(c.plan_status === "active" || c.plan_status === "past_due")) continue;
    if (p.legacy) mix.legacy++;
    else mix[p.period as "month" | "year"]++;
  }

  const views = of("plan_viewed", events);
  const openedIn = (lo: number, hi: number) => new Set(views.filter((e) => typeof e.meta?.age_days === "number" && (e.meta.age_days as number) >= lo && (e.meta.age_days as number) <= hi).map((e) => e.creator_id));
  const agedAtLeast = (d: number) => creators.filter((c) => now - Date.parse(c.created_at) >= d * DAY && now - Date.parse(c.created_at) <= 120 * DAY);
  const w2 = agedAtLeast(14);
  const w4 = agedAtLeast(28);
  const in2 = openedIn(7, 13);
  const in4 = openedIn(21, 27);

  const scoreOpened = ids(of("scorecard_opened", events));

  const churn: Record<string, Rate> = {};
  const canceled = of("canceled");
  const plans = new Set([...creators.map((c) => c.plan).filter((p) => paidPlanOf(p)), ...canceled.map((e) => String(e.meta?.plan ?? ""))].filter(Boolean));
  for (const plan of plans) {
    const gone = canceled.filter((e) => e.meta?.plan === plan).length;
    const active = creators.filter((c) => c.plan === plan && (c.plan_status === "active" || c.plan_status === "past_due")).length;
    churn[plan] = rate(gone, gone + active);
  }

  return {
    handleToAccount: rate(created.length, previews.size),
    accountToPlan: rate(viewed.length, createdIds.size),
    planToPaid: rate(paid.length, viewed.length),
    paidByTier,
    mix,
    week2: rate(w2.filter((c) => in2.has(c.id)).length, w2.length),
    week4: rate(w4.filter((c) => in4.has(c.id)).length, w4.length),
    scorecard: rate([...opts.checked].filter((id) => scoreOpened.has(id)).length, opts.checked.size),
    share: rate(of("share_card").length, previews.size),
    churn,
  };
}
