/**
 * Dated moments expire. Nothing in the pipeline knew that.
 *
 * On 2026-09-12 the top three picks for a Chapel Hill coffee shop were
 * "labor day weekend", "labor day bookings" and "labor day plans" — all
 * grade A, all scored a perfect 1.0 fit by the relevance judge, all from
 * TikTok's national board, and all for a holiday that ended on the 7th.
 * Two of them were the same hashtag (#laborday2026) named differently on
 * two different days, so one dead holiday filled three of five slots.
 *
 * Momentum made it worse rather than catching it: conversation about a
 * holiday peaks the week OF the holiday, so the delta was +100% and the
 * scorer read a dying trend as the strongest signal of the week.
 *
 * A term naming a date that has passed is not an opportunity at any score.
 * This is a hard gate, not a penalty — an owner asked to buy ads for last
 * weekend stops believing the other four picks too.
 */

export interface DatedMoment {
  /** What the term refers to. */
  label: string;
  /** The moment's date in a given year. */
  dateIn: (year: number) => Date;
  /** Words that identify it. All must appear (after normalisation). */
  match: string[][];
}

/** UTC date, so a moment never shifts by a timezone. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** The nth given weekday of a month — "1st Monday of September". */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + shift + (n - 1) * 7);
}

/** The last given weekday of a month — "last Monday of May". */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return utc(year, month, last.getUTCDate() - shift);
}

/**
 * The moments that actually drive local ad spend and have a hard date.
 * Deliberately not every holiday: a moment belongs here only when being a
 * day late makes the ad worthless.
 */
export const DATED_MOMENTS: DatedMoment[] = [
  { label: "New Year's Day", dateIn: (y) => utc(y, 1, 1), match: [["new", "year"]] },
  { label: "Valentine's Day", dateIn: (y) => utc(y, 2, 14), match: [["valentine"]] },
  { label: "Super Bowl", dateIn: (y) => nthWeekday(y, 2, 0, 2), match: [["super", "bowl"], ["superbowl"]] },
  { label: "St Patrick's Day", dateIn: (y) => utc(y, 3, 17), match: [["patrick"], ["paddy"]] },
  { label: "Cinco de Mayo", dateIn: (y) => utc(y, 5, 5), match: [["cinco"]] },
  { label: "Mother's Day", dateIn: (y) => nthWeekday(y, 5, 0, 2), match: [["mother", "day"], ["mothers", "day"]] },
  { label: "Memorial Day", dateIn: (y) => lastWeekday(y, 5, 1), match: [["memorial", "day"]] },
  { label: "Father's Day", dateIn: (y) => nthWeekday(y, 6, 0, 3), match: [["father", "day"], ["fathers", "day"]] },
  { label: "Juneteenth", dateIn: (y) => utc(y, 6, 19), match: [["juneteenth"]] },
  { label: "Fourth of July", dateIn: (y) => utc(y, 7, 4), match: [["fourth", "july"], ["july", "4th"], ["independence", "day"]] },
  { label: "Labor Day", dateIn: (y) => nthWeekday(y, 9, 1, 1), match: [["labor", "day"], ["laborday"], ["ldw"]] },
  { label: "Halloween", dateIn: (y) => utc(y, 10, 31), match: [["halloween"]] },
  { label: "Thanksgiving", dateIn: (y) => nthWeekday(y, 11, 4, 4), match: [["thanksgiving"]] },
  { label: "Black Friday", dateIn: (y) => new Date(nthWeekday(y, 11, 4, 4).getTime() + 86400_000), match: [["black", "friday"]] },
  { label: "Cyber Monday", dateIn: (y) => new Date(nthWeekday(y, 11, 4, 4).getTime() + 4 * 86400_000), match: [["cyber", "monday"]] },
  { label: "Christmas", dateIn: (y) => utc(y, 12, 25), match: [["christmas"], ["xmas"]] },
  { label: "New Year's Eve", dateIn: (y) => utc(y, 12, 31), match: [["new", "years", "eve"], ["nye"]] },
];

/**
 * A holiday's demand does not end at midnight — someone searching on the
 * day itself still converts — but it is dead the morning after.
 */
const GRACE_DAYS = 1;

export interface MomentRead {
  label: string;
  /** The occurrence this term is about. */
  date: Date;
  /** Negative once the moment has passed. */
  daysOut: number;
  /** True when the moment is behind us and the ad would be worthless. */
  expired: boolean;
}

function words(term: string): string[] {
  return term.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Which dated moment a term is about, and whether it has passed.
 *
 * A year written into the term ("laborday2026") pins the occurrence. With
 * no year, the nearest occurrence is used — the one just gone if it is
 * within a fortnight, otherwise the next one — because "labor day" in
 * mid-September means the one that just happened, not the one in a year.
 */
export function readMoment(term: string, now = new Date()): MomentRead | null {
  const w = words(term);
  const joined = w.join("");
  const explicitYear = /(20\d{2})/.exec(term)?.[1];

  for (const moment of DATED_MOMENTS) {
    const hit = moment.match.some((group) =>
      group.every((token) => w.includes(token) || joined.includes(token)),
    );
    if (!hit) continue;

    const year = explicitYear ? Number(explicitYear) : now.getUTCFullYear();
    let date = moment.dateIn(year);
    if (!explicitYear) {
      // Pick the nearest occurrence, looking back further than forward.
      const prev = moment.dateIn(year - 1);
      const next = moment.dateIn(year + 1);
      const candidates = [prev, date, next];
      date = candidates.reduce((best, d) =>
        Math.abs(d.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime()) ? d : best,
      );
    }
    const daysOut = Math.round((date.getTime() - now.getTime()) / 86400_000);
    return { label: moment.label, date, daysOut, expired: daysOut < -GRACE_DAYS };
  }
  return null;
}

/** True when this term is about a moment that has already gone. */
export function isExpiredMoment(term: string, now = new Date()): boolean {
  return readMoment(term, now)?.expired ?? false;
}
