import Link from "next/link";

import Brand from "@/components/brand";
import { getAdminRepo } from "@/lib/db/admin";
import type { TestWatch } from "@/lib/db/types";

import "../landing.css";
import "../read.css";

export const metadata = { title: "Watching your test — TRND", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where the watch emails land. Confirming and stopping are buttons that
 * post, never the email link itself, so a mail scanner that opens every
 * link can't start or stop a watch.
 */
export default async function WatchPage({ searchParams }: PageProps<"/watch">) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const token = one("confirm") || one("stop") || one("t");
  const watch: TestWatch | null = token ? await getAdminRepo().getTestWatchByToken(token).catch(() => null) : null;
  const done = one("done");

  let kicker = "Keep score";
  let title: React.ReactNode;
  let body: React.ReactNode;
  let action: React.ReactNode = null;

  if (done === "confirmed" && watch) {
    title = (
      <>
        Watching. <em>The clock starts at launch.</em>
      </>
    );
    body = (
      <p className="rd-soft">
        When {watch.brand_name}&rsquo;s version of &ldquo;{watch.title}&rdquo; shows up in the Ad Library, we&rsquo;ll email you, then again at
        three weeks or when it stops. Keep the hook&rsquo;s first words in the caption or on screen: that&rsquo;s how we spot it.
      </p>
    );
  } else if (done === "stopped") {
    title = "Stopped. No more emails.";
    body = <p className="rd-soft">We&rsquo;ve stopped watching that test. Run a new read any time.</p>;
  } else if (one("confirm") && watch?.status === "pending") {
    title = (
      <>
        Start watching for <em>{watch.brand_name}&rsquo;s ad?</em>
      </>
    );
    body = (
      <p className="rd-soft">
        We&rsquo;ll look for your version of &ldquo;{watch.title}&rdquo; in the Ad Library every day, and email {watch.email} when it goes live,
        at three weeks, and when it stops.
      </p>
    );
    action = (
      <form action="/api/read/watch/confirm" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="rd-btn rd-btn--gold rd-btn--lg">
          Start watching →
        </button>
      </form>
    );
  } else if (one("stop") && watch && watch.status !== "stopped") {
    kicker = "Stop watching";
    title = `Stop watching ${watch.brand_name}'s test?`;
    body = <p className="rd-soft">No more emails about &ldquo;{watch.title}&rdquo;. Nothing else changes.</p>;
    action = (
      <form action="/api/read/watch/stop" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="rd-btn rd-btn--ghost rd-btn--lg">
          Stop these emails
        </button>
      </form>
    );
  } else if (watch) {
    title = watch.status === "stopped" ? "Already stopped." : "Already watching.";
    body = <p className="rd-soft">Nothing to do here. We&rsquo;ll email when there&rsquo;s news.</p>;
  } else {
    title = "That link didn't work.";
    body = <p className="rd-soft">It may be old or cut short. Run a new read and watch its test from there.</p>;
  }

  return (
    <div className="rd">
      <div className="rd-atmos" aria-hidden="true" />
      <nav className="rd-nav">
        <Brand href="/" />
        <div className="rd-nav__right">
          <Link href="/" className="rd-btn rd-btn--ghost rd-btn--sm">
            Free read
          </Link>
        </div>
      </nav>
      <main className="rd-watch-page">
        <div className="rd-panel">
          <span className="rd-kicker rd-kicker--gold">{kicker}</span>
          <h1 className="rd-h2">{title}</h1>
          {body}
          {action ? <div className="rd-watch-page__action">{action}</div> : null}
        </div>
      </main>
    </div>
  );
}
