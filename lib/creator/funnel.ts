/**
 * The creator funnel's numbers, from its event log. Pure, so the studio and
 * the tests read the same thing.
 */

/** The creator plan's price, shown on the upgrade card, the early-access page and nowhere else. */
export const CREATOR_PRICE = "$19";

/** The ?src= a shared result's "check yours" carries. */
export const SHARED_SRC = "shared";

export type FunnelEventKind = "check" | "check_failed" | "upgrade_click" | "waitlist" | "lead" | "teardown" | "share" | "share_view";

export interface FunnelEvent {
  kind: string;
  handle: string | null;
  src: string | null;
  created_at: string;
}

export interface SourceRow {
  src: string;
  checks: number;
  upgrades: number;
  waitlist: number;
  leads: number;
}

export interface Funnel {
  checks: number;
  failed: number;
  creators: number;
  upgrades: number;
  /** Left an email on the plan's early-access page. */
  waitlist: number;
  leads: number;
  teardowns: number;
  /** Results shared (link copied, image saved or the share sheet used). */
  shares: number;
  /** Visits to a shared result's page. */
  shareViews: number;
  /** Checks started from a shared result: the loop that makes it spread. */
  fromShares: number;
  /** Upgrade clicks per completed check, 0-1; null before any check. */
  upgradeRate: number | null;
  leadRate: number | null;
  bySource: SourceRow[];
}

/**
 * The demand test, decided in advance so the numbers can't be argued with
 * later: after enough checks, enough upgrade clicks means build the paid
 * plan; too few means change the offer before writing more code.
 */
export const DECIDE_AFTER = 100;
export const BUILD_AT = 0.03;
export const REWORK_BELOW = 0.01;

export type Verdict = "collecting" | "build" | "rework" | "keep_testing";

export function verdict(f: Pick<Funnel, "checks" | "upgradeRate">): Verdict {
  if (f.checks < DECIDE_AFTER || f.upgradeRate === null) return "collecting";
  if (f.upgradeRate >= BUILD_AT) return "build";
  if (f.upgradeRate < REWORK_BELOW) return "rework";
  return "keep_testing";
}

export function funnel(events: FunnelEvent[]): Funnel {
  const count = (k: FunnelEventKind) => events.filter((e) => e.kind === k).length;
  const checks = count("check");
  const upgrades = count("upgrade_click");
  const leads = count("lead");
  const waitlist = count("waitlist");
  const sources = new Map<string, SourceRow>();
  for (const e of events) {
    const src = e.src || "direct";
    const row = sources.get(src) ?? { src, checks: 0, upgrades: 0, waitlist: 0, leads: 0 };
    if (e.kind === "check") row.checks++;
    else if (e.kind === "upgrade_click") row.upgrades++;
    else if (e.kind === "waitlist") row.waitlist++;
    else if (e.kind === "lead") row.leads++;
    else continue;
    sources.set(src, row);
  }
  return {
    checks,
    failed: count("check_failed"),
    creators: new Set(events.filter((e) => e.kind === "check" && e.handle).map((e) => e.handle)).size,
    upgrades,
    waitlist,
    leads,
    teardowns: count("teardown"),
    shares: count("share"),
    shareViews: count("share_view"),
    fromShares: events.filter((e) => e.kind === "check" && e.src === SHARED_SRC).length,
    upgradeRate: checks ? upgrades / checks : null,
    leadRate: checks ? leads / checks : null,
    bySource: [...sources.values()].sort((a, b) => b.checks - a.checks),
  };
}

/** Events from the last `days` days. */
export const within = (events: FunnelEvent[], days: number, now = Date.now()) => events.filter((e) => now - Date.parse(e.created_at) < days * 86_400_000);
