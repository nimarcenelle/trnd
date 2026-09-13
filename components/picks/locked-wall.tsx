import Link from "next/link";

import { FOUNDING_PRICE, GUARANTEE } from "@/lib/billing";

/**
 * What a lapsed account sees in place of the week's call.
 *
 * The finding and the grade stay on the page above this: enough to know a
 * call was made and how strong it is, not enough to run it. The bet, the
 * scripts and the evidence are what the subscription buys, so they are what
 * the wall holds. Nothing already built is behind it — a campaign generated
 * on the trial stays readable and exportable forever.
 */
export default function LockedWall({ reason }: { reason: string | null }) {
  return (
    <section className="pickwall" aria-labelledby="pickwall-title">
      <h2 id="pickwall-title" className="pickwall__title">
        The rest of this call is on the plan
      </h2>
      <p className="pickwall__reason">{reason ?? "Your free trial has ended."}</p>
      <ul className="pickwall__list">
        <li>The bet: what to run, at what budget, for how long, and when to kill it</li>
        <li>Three scripts, written for this term against your own catalog and prices</li>
        <li>The evidence under each of the four signals, with every source</li>
      </ul>
      <div className="pickwall__cta">
        <Link href="/app/settings#billing" className="btn btn-primary btn-sm">
          Start TRND — {FOUNDING_PRICE}
        </Link>
        <span className="pickwall__note">Cancel anytime. The campaigns you already built stay yours.</span>
      </div>
      <p className="pickwall__guarantee">{GUARANTEE}</p>
    </section>
  );
}
