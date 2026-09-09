/**
 * The proactive half of timing: known demand moments per category, with the
 * lead time an owner actually needs to be ready. Untrained operators are
 * worst at timing — this removes it. Our own data, no model.
 */
import { verticalKey } from "@/lib/signals/vertical";

export interface SeasonalMoment {
  label: string;
  /** 1-12 / 1-31, the demand peak. */
  month: number;
  day: number;
  /** Weeks before the peak when creative + launch prep should start. */
  leadWeeks: number;
  advice: string;
}

const MOMENTS: Record<string, SeasonalMoment[]> = {
  "Restaurants & cafés": [
    { label: "Valentine's dinner rush", month: 2, day: 14, leadWeeks: 3, advice: "Prix-fixe or date-night offer; reservations open early." },
    { label: "Mother's Day brunch", month: 5, day: 10, leadWeeks: 3, advice: "The year's biggest brunch day — push reservations, not discounts." },
    { label: "Graduation season", month: 5, day: 20, leadWeeks: 3, advice: "Group tables and celebration packages." },
    { label: "Patio season opens", month: 4, day: 15, leadWeeks: 2, advice: "First warm week fills patios — announce yours first." },
    { label: "Labor Day weekend", month: 9, day: 7, leadWeeks: 2, advice: "Long-weekend plans get made midweek — be in feeds by Wednesday." },
    { label: "Holiday party bookings", month: 12, day: 10, leadWeeks: 6, advice: "Office parties book in early November — sell the private table now." },
  ],
  "Home services": [
    { label: "First cold snap", month: 10, day: 15, leadWeeks: 4, advice: "Heating tune-up offers beat the emergency-season ad prices." },
    { label: "Spring exterior season", month: 4, day: 1, leadWeeks: 3, advice: "Gutters, pressure washing, landscaping — book the backlog early." },
    { label: "First heat wave", month: 6, day: 10, leadWeeks: 4, advice: "AC checks sell cheapest before everyone's sweating." },
    { label: "Holiday-ready home", month: 11, day: 15, leadWeeks: 3, advice: "Cleaning and repairs before guests arrive." },
  ],
  "Health & beauty": [
    { label: "Wedding season peak", month: 5, day: 15, leadWeeks: 8, advice: "Multi-session treatments need runway — sell the timeline, not the day-of." },
    { label: "Holiday party glow", month: 12, day: 5, leadWeeks: 4, advice: "Party-season bookings spike after Thanksgiving." },
    { label: "New Year reset", month: 1, day: 5, leadWeeks: 2, advice: "Memberships and maintenance plans, not one-offs." },
    { label: "Prom season", month: 4, day: 20, leadWeeks: 4, advice: "Parents book; market to them, not the teens." },
  ],
  "Fitness studios": [
    { label: "New Year wave", month: 1, day: 2, leadWeeks: 3, advice: "The year's biggest intake — intro offers live before Jan 1." },
    { label: "Summer-ready push", month: 5, day: 1, leadWeeks: 4, advice: "Goal-driven joiners convert fast on a clear program." },
    { label: "Back-to-routine September", month: 9, day: 8, leadWeeks: 2, advice: "School's back, schedules reset — second-biggest joining wave." },
  ],
  "Retail & boutiques": [
    { label: "Holiday gifting", month: 12, day: 1, leadWeeks: 6, advice: "Build audiences cheaply in October; spend into December intent." },
    { label: "Mother's Day gifts", month: 5, day: 10, leadWeeks: 3, advice: "Gift-ready bundles with a deadline promise." },
    { label: "Back to school", month: 8, day: 10, leadWeeks: 3, advice: "The August wardrobe reset." },
    { label: "Valentine's gifts", month: 2, day: 14, leadWeeks: 3, advice: "Last-minute buyers dominate — same-day pickup is the hook." },
  ],
  "Auto services": [
    { label: "Winter prep", month: 11, day: 1, leadWeeks: 4, advice: "Tires, batteries, and inspections before the first freeze." },
    { label: "Road-trip season", month: 6, day: 15, leadWeeks: 3, advice: "Pre-trip checks — sell peace of mind, not parts." },
    { label: "Pothole aftermath", month: 3, day: 15, leadWeeks: 2, advice: "Alignment and suspension demand follows the thaw." },
  ],
  "Dental & wellness": [
    { label: "Use-it-or-lose-it benefits", month: 11, day: 15, leadWeeks: 4, advice: "Insurance deadlines are the year's strongest urgency — say the date." },
    { label: "Back-to-school checkups", month: 8, day: 15, leadWeeks: 3, advice: "Family scheduling window — book siblings together." },
    { label: "New Year whitening", month: 1, day: 10, leadWeeks: 2, advice: "Resolution energy favors visible, fast wins." },
    { label: "Wedding smiles", month: 4, day: 15, leadWeeks: 8, advice: "Aligners and whitening need lead time — market the timeline." },
  ],
};

export interface UpcomingMoment extends SeasonalMoment {
  /** Days until the peak. */
  daysOut: number;
  /** True when prep should already be underway. */
  prepNow: boolean;
}

/** Moments peaking within the next `horizonDays`, soonest first. */
export function upcomingMoments(
  category: string,
  now: Date = new Date(),
  horizonDays = 70,
): UpcomingMoment[] {
  const moments = MOMENTS[verticalKey(category)] ?? [];
  const out: UpcomingMoment[] = [];
  for (const m of moments) {
    let peak = new Date(Date.UTC(now.getUTCFullYear(), m.month - 1, m.day));
    if (peak.getTime() < now.getTime() - 86400_000) {
      peak = new Date(Date.UTC(now.getUTCFullYear() + 1, m.month - 1, m.day));
    }
    const daysOut = Math.round((peak.getTime() - now.getTime()) / 86400_000);
    if (daysOut <= horizonDays) {
      out.push({ ...m, daysOut, prepNow: daysOut <= m.leadWeeks * 7 });
    }
  }
  return out.sort((a, b) => a.daysOut - b.daysOut).slice(0, 3);
}