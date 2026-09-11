import Link from "next/link";

import Brand from "@/components/brand";
import SnapshotForm from "@/components/snapshot/snapshot-form";

import "./snapshot.css";

export const metadata = {
  title: "What should you advertise this week? — TRND",
  description:
    "Put in your website. TRND reads what you sell, measures demand in your metro, checks who else is advertising, and writes the ad. No signup.",
};

/**
 * The front door for people who haven't signed up — and the page the cold
 * email links to (`/snapshot?url=theirsite.com` runs on arrival, so the
 * promise in the email is already being kept when the page opens).
 */
export default async function SnapshotIndexPage({ searchParams }: PageProps<"/snapshot">) {
  const params = await searchParams;
  const raw = Array.isArray(params.url) ? params.url[0] : params.url;
  const prefill = typeof raw === "string" ? raw.slice(0, 300) : "";

  return (
    <main className="snap-shell">
      <header className="snap-nav">
        <Brand href="/" />
        <Link className="btn btn-ghost btn-sm" href="/login">
          Sign in
        </Link>
      </header>

      <section className="snap-hero">
        <span className="eyebrow">Free demand snapshot</span>
        <h1 className="h-disp">What should you advertise this week?</h1>
        <p className="snap-lede">
          Put in your website. We&apos;ll read what you sell, measure what people near you are
          searching for right now, check who else is advertising on it — and write the ad.
        </p>
        <SnapshotForm initialUrl={prefill} autoStart={Boolean(prefill)} />
      </section>

      <section className="snap-how">
        <h2>What you get, in about a minute</h2>
        <ol>
          <li>
            <strong>What we found on your site</strong> — your services and prices, read once.
            Every line after this is written against that list.
          </li>
          <li>
            <strong>What&apos;s moving where you are</strong> — demand measured in your metro,
            not nationally, with a link to check each read.
          </li>
          <li>
            <strong>Who else is advertising</strong> — live counts of rival ads on the same
            terms, and what they&apos;re saying.
          </li>
          <li>
            <strong>The ad</strong> — hook, offer, audience and headlines, priced from your own
            menu.
          </li>
        </ol>
      </section>
    </main>
  );
}
