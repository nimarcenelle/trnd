const nyToday = (now: Date) => {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return new Date(ny.getFullYear(), ny.getMonth(), ny.getDate());
};

export type Countdown = { days: number; what: string };

/**
 * The regular-decision deadline the site counts down to, in New York days. Most fall on January 1; a second group falls
 * on January 15. Between January 16 and the end of July there is nothing to count to, so there is no countdown.
 */
export function rdCountdown(now = new Date()): Countdown | null {
  const today = nyToday(now);
  const year = today.getFullYear();
  const days = (due: Date) => Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (today.getMonth() === 0) {
    if (today.getDate() <= 1) return { days: days(new Date(year, 0, 1)), what: "most regular-decision deadlines" };
    if (today.getDate() <= 15) return { days: days(new Date(year, 0, 15)), what: "the January 15 deadlines" };
    return null;
  }
  if (today.getMonth() < 7) return null;
  return { days: days(new Date(year + 1, 0, 1)), what: "most regular-decision deadlines" };
}

/** "43 days until most regular-decision deadlines", or null when no deadline is near. */
export function rdCountdownLine(now = new Date()): string | null {
  const c = rdCountdown(now);
  if (!c) return null;
  const what = c.what.replace(/^m/, "M").replace(/^t/, "T");
  return c.days === 0 ? `${what} are today` : `${c.days} day${c.days === 1 ? "" : "s"} until ${c.what}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days until a deadline written like "Jan 2", counted in New York, or null if it can't be read. */
export function daysUntil(monthDay: string | null | undefined, now = new Date()): number | null {
  const m = /^([A-Z][a-z]{2})\w*\s+(\d{1,2})$/.exec(monthDay?.trim() ?? "");
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || month < 0) return null;
  const today = nyToday(now);
  let due = new Date(today.getFullYear(), month, Number(m[2]));
  if (due < today) due = new Date(today.getFullYear() + 1, month, Number(m[2]));
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
