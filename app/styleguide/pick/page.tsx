import DemandGraph from "@/components/app/demand-graph";
import GradeCard from "@/components/app/grade-card";
import PickBriefing from "@/components/app/pick-briefing";
import PickPager from "@/components/app/pick-pager";
import { buildBriefing } from "@/lib/recommend/briefing";
import type { BusinessBrief, Service } from "@/lib/db/types";

export const metadata = { title: "TRND — Pick screen reference" };

/**
 * A no-auth reference of the pick screen's parts, with fixture data.
 *
 * /app needs a real session, which makes the actual screen impossible to
 * look at while designing it. This renders the same components against
 * representative data so type, spacing and the demand axis can be judged
 * without signing in. It is a reference, not the screen — the composition
 * lives in app/app/page.tsx and this page deliberately holds no logic that
 * could drift away from it.
 */

const brief = {
  customer_segments: ["Desk workers in their 30s who lift and want recovery, not a spa day"],
  advantages: ["Walkable from the Beltline", "The only contrast therapy suite inside the perimeter"],
  moat: "Only contrast therapy suite inside the perimeter.",
  pricing_read: "Your prices sit mid-market for Atlanta. Lead with the intro session, not the package.",
  seasonality: "Demand peaks in January and again right after Labor Day.",
  watchouts: [
    "Never imply medical outcomes — recovery claims only",
    "Meta flags cold plunge creative as wellness; avoid before-and-after body shots",
  ],
} as unknown as BusinessBrief;

const service: Service = {
  id: "s", business_id: "b", name: "contrast therapy session",
  description: null, price_cents: 4500, is_active: true,
};

const WEEKS = [
  { day: "2026-07-23", points: 34 },
  { day: "2026-07-30", points: 33 },
  { day: "2026-08-06", points: 38 },
  { day: "2026-08-13", points: 44 },
  { day: "2026-08-20", points: 47 },
  { day: "2026-08-27", points: 52 },
  { day: "2026-09-03", points: 58 },
  { day: "2026-09-10", points: 62 },
];

export default function PickReference() {
  const rows = buildBriefing({
    brief,
    matchedService: service,
    signal: null,
    adCount: 5,
    adAdvertisers: ["Sweat ATL", "Recover Midtown"],
    moment: { label: "Post-Labor-Day recovery rush", when: "12 days out" },
    city: "Atlanta",
  });
  return (
    <div className="page pick">
      <header className="pick__top">
        <div className="pick__id">
          <p className="pick__eyebrow">#1 this week · Atlanta metro</p>
          <h1 className="pick__title">Contrast therapy sessions</h1>
        </div>
        <PickPager index={0} total={5} terms={["contrast therapy", "cold plunge", "infrared sauna", "recovery membership", "sports massage"]} />
      </header>

      <div className="pick__grid">
        <PickBriefing rows={rows} />
        <main className="pick__main">
          <section className="card pick__why">
            <p className="pick__lede">
              Demand for contrast therapy near you has climbed six weeks straight, and you are the
              only studio inside the perimeter selling it as its own session rather than a sauna add-on.
            </p>
            <p className="pick__para">
              The search read is local, not national, and it lines up with what people are watching:
              short-form on this is running 20-second single-take clips with the price on screen.
              Nobody in your radius is bidding on the term yet.
            </p>
          </section>

          <div className="pick__row">
            <GradeCard score={7.4} />
            <div className="card pick__demand">
              <DemandGraph
                weeks={WEEKS}
                deltaPct={7}
                caption="62 points — about 8.3K weekly touches on this, weighted by how much each one means."
              />
            </div>
          </div>

          <section className="card pick__social">
            <h2 className="pick__h">What short-form says</h2>
            <p className="pick__para">YouTube Shorts measured 3.6M views on this in the last seven days.</p>
            <dl className="factgrid">
              <div className="factgrid__cell"><dt>Watched this week</dt><dd>3.6M views across 47 new videos</dd></div>
              <div className="factgrid__cell"><dt>Length that wins</dt><dd>20 seconds</dd></div>
              <div className="factgrid__cell"><dt>Reaction rate</dt><dd>4.9% of views like or comment</dd></div>
              <div className="factgrid__cell"><dt>Being worked by</dt><dd>Ice Miki, Daniel Plunges — posting more than once a week on it</dd></div>
            </dl>
          </section>

          <section className="card pick__rivals">
            <h2 className="pick__h">Who else is going after this</h2>
            <p className="pick__para">
              5 advertisers near Atlanta are already running on this. 12 keyword matches were other
              industries and are not counted.
            </p>
            <ul className="proof">
              <li><b>Sweat ATL</b><span>Recovery memberships from $99/mo — sauna, plunge, and compression in one room.</span></li>
              <li><b>Recover Midtown</b><span>Your first contrast session is $29. Walk in, we handle the rest.</span></li>
            </ul>
          </section>

          <div className="actionbar">
            <p className="actionbar__text">Your ad for this pick is written and ready to review.</p>
            <a className="btn btn-primary btn-lg" href="#">Open the campaign</a>
          </div>
        </main>
      </div>
    </div>
  );
}
