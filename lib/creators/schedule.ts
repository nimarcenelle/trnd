/**
 * The weekly rhythm. Every creator's plan drops the same weekday at the same
 * local time (Tuesday, 8 AM in their timezone), so it becomes a habit; and a
 * streak counts the weeks in a row they posted at least one idea from a plan.
 * Pure: the cron and the pages pass the clock in.
 */

export const PLAN_WEEKDAY = 2; // Tuesday (0 = Sunday)
export const PLAN_HOUR = 8;
export const DEFAULT_TZ = "America/New_York";
const DAY = 86_400_000;
const WEEK = 7 * DAY;

export const validTz = (tz: string | null | undefined): string => {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
};

/** The zone's offset from UTC at an instant, in ms (New York in winter: -5h). */
function offsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - (at - (at % 1000));
}

/** The local calendar day of an instant: [year, month 0-11, day, weekday 0-6, hour]. */
function localDay(tz: string, at: number): [number, number, number, number, number] {
  const local = new Date(at + offsetMs(tz, at));
  return [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCDay(), local.getUTCHours()];
}

/** The UTC instant of a local wall-clock time. */
function atLocal(tz: string, y: number, m: number, d: number, hour: number): number {
  const guess = Date.UTC(y, m, d, hour);
  // Twice, so a guess on the far side of a daylight-saving change settles.
  const first = guess - offsetMs(tz, guess);
  return guess - offsetMs(tz, first);
}

/** The latest plan slot (Tuesday 8 AM local) at or before `now`. */
export function lastSlot(now: number, tz?: string | null): number {
  const zone = validTz(tz);
  const [y, m, d, wd] = localDay(zone, now);
  const back = (wd - PLAN_WEEKDAY + 7) % 7;
  let slot = atLocal(zone, y, m, d - back, PLAN_HOUR);
  if (slot > now) slot = atLocal(zone, y, m, d - back - 7, PLAN_HOUR);
  return slot;
}

/** The next plan slot after `now`. */
export const nextSlot = (now: number, tz?: string | null): number => lastSlot(now + WEEK, tz);

/** Whether a new weekly plan is due: none yet, or none since this week's slot. */
export function planSlotDue(lastPlanAt: string | null | undefined, tz: string | null | undefined, now = Date.now()): boolean {
  return !lastPlanAt || Date.parse(lastPlanAt) < lastSlot(now, tz);
}

/** "Tuesday 8 AM" in the creator's words, for the email and the app. */
export const slotLabel = () => `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][PLAN_WEEKDAY]} ${PLAN_HOUR} AM`;

/**
 * Weeks in a row with at least one plan idea posted, counted in plan weeks
 * (slot to slot). The current week counts once it has a post; until then the
 * streak runs to last week, so it doesn't reset on a Tuesday morning.
 */
export function streakOf(postedAt: (string | null)[], tz?: string | null, now = Date.now()): number {
  const times = postedAt.filter((t): t is string => Boolean(t)).map((t) => Date.parse(t));
  if (!times.length) return 0;
  const start = lastSlot(now, tz);
  const has = (k: number) => times.some((t) => t >= start - k * WEEK && t < start - (k - 1) * WEEK);
  let k = has(0) ? 0 : 1;
  let streak = 0;
  while (has(k)) {
    streak++;
    k++;
  }
  return streak;
}
