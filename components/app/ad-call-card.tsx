import Link from "next/link";

import type { AdCall } from "@/lib/recommend/ad-call";

/**
 * The call, at the top of the pick: what to run, to whom, where, how, and
 * why, then the scripts. Everything below it on the page is the evidence.
 */
export default function AdCallCard({
  call,
  campaignId,
  building,
}: {
  call: AdCall;
  campaignId: string | null;
  building: boolean;
}) {
  return (
    <section className={`card adcall adcall--${call.verdict}`} aria-label="This week's call">
      <p className="adcall__verdict">{call.headline}</p>
      <p className="adcall__promote">{call.promote}</p>
      <dl className="adcall__rows">
        {call.angle && (
          <div>
            <dt>Angle</dt>
            <dd>&ldquo;{call.angle}&rdquo;</dd>
          </div>
        )}
        <div>
          <dt>Format</dt>
          <dd>{call.format}</dd>
        </div>
        {call.why.length > 0 && (
          <div>
            <dt>Why</dt>
            <dd>
              <ul className="adcall__why">
                {call.why.map((w) => (
                  <li key={w}>{/[.)"]$/.test(w) ? w : `${w}.`}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      {call.scripts.length > 0 ? (
        <details className="adcall__scripts">
          <summary>
            Here {call.scripts.length === 1 ? "is 1 script" : `are ${call.scripts.length} scripts`} to test
          </summary>
          <ol>
            {call.scripts.map((script, i) => (
              <li key={i}>
                <pre>{script}</pre>
              </li>
            ))}
          </ol>
          {campaignId && (
            <Link href={`/app/campaigns/${campaignId}`} className="btn btn-ghost btn-sm">
              Open the full campaign
            </Link>
          )}
        </details>
      ) : building ? (
        <p className="pick__note">The scripts are being written. They land here in a moment.</p>
      ) : null}
    </section>
  );
}
