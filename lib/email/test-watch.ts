import type { TestWatch, TestWatchStage } from "@/lib/db/types";
import { env } from "@/lib/env";
import type { RivalState } from "@/lib/watch/match";

import { eyebrow, esc, FONT, INK, LINE, paragraph, renderEmail } from "./layout";
import { sendEmail } from "./send";

/**
 * The free read's loop, in the inbox: confirm the watch, then the test
 * going live, passing three weeks, stopping or never showing, each against
 * the rival ad it was modeled on. The Ad Library only shows survival, so
 * every email says running is a hint and not proof, and points at what
 * would say why: the brief checked against the ad, and real numbers.
 */

const REASON = "You get this because you asked TRND to watch for this ad from a free read.";

export function confirmUrl(token: string): string {
  return `${env.appUrl}/watch?confirm=${encodeURIComponent(token)}`;
}
export function stopUrl(token: string): string {
  return `${env.appUrl}/watch?stop=${encodeURIComponent(token)}`;
}

function quote(text: string): string {
  return `<p style="margin:0 0 14px;padding:12px 14px;border-left:3px solid ${LINE};font-family:${FONT};font-size:14px;line-height:1.55;color:${INK};">&ldquo;${esc(text)}&rdquo;</p>`;
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** One line on the rival ad the test was modeled on, as far as the read can say. */
export function rivalLine(watch: Pick<TestWatch, "rival">, rival: RivalState): string | null {
  if (!watch.rival) return null;
  const who = watch.rival.advertiser;
  if (rival.state === "running") return `The ad you cheated off, ${who}'s, is still running at ${plural(rival.days)}.`;
  if (rival.state === "stopped") return `The ad you cheated off, ${who}'s, has since stopped.`;
  return rival.days !== null ? `The ad you cheated off, ${who}'s, had been running ${plural(rival.days)} when you read it.` : null;
}

const HINT = "Running is a hint, not proof: the Ad Library shows how long an ad lives, never what it spent or sold.";

export interface WatchEmail {
  subject: string;
  html: string;
}

export function confirmEmail(watch: TestWatch): WatchEmail {
  const rival = watch.rival ? rivalLine(watch, { state: "unknown", days: watch.rival.startedOn ? Math.max(0, Math.floor((Date.parse(watch.created_at) - Date.parse(`${watch.rival.startedOn}T00:00:00Z`)) / 86400_000)) : null }) : null;
  return {
    subject: `Confirm: watch for ${watch.brand_name}'s new ad`,
    html: renderEmail({
      preheader: `One click and we start watching the Ad Library for "${watch.title}".`,
      title: "One click and we start watching.",
      intro: `You asked TRND to watch the Ad Library for ${watch.brand_name}'s version of "${watch.title}".`,
      body: [
        eyebrow("The hook", { first: true }),
        quote(watch.hook),
        paragraph(`When it goes live we'll tell you, then again at three weeks or when it stops.${rival ? ` ${rival}` : ""}`),
        paragraph("Keep the hook's first words in the caption or on screen: that's how we spot it."),
      ].join(""),
      cta: { label: "Start watching", url: confirmUrl(watch.token) },
      footnote: "Didn't ask for this? Ignore it and nothing happens.",
      reason: REASON,
    }),
  };
}

export function stageEmail(watch: TestWatch, stage: Exclude<TestWatchStage, "confirm">, days: number | null, rival: RivalState): WatchEmail {
  const brand = watch.brand_name;
  const rivalText = rivalLine(watch, rival);
  const common = { reason: REASON, stopUrl: stopUrl(watch.token) };
  const ad = watch.matched_ad;

  if (stage === "live") {
    return {
      subject: `${brand}: your version is live`,
      html: renderEmail({
        preheader: `We found ${brand}'s version of "${watch.title}" in the Ad Library.`,
        title: "It's live. The clock's running.",
        intro: `We found ${brand}'s new ad in the Ad Library${ad?.startedOn ? `, started ${ad.startedOn}` : ""}.`,
        body: [ad ? quote(ad.text) : "", rivalText ? paragraph(rivalText, INK) : "", paragraph("We'll write again at three weeks, or when it stops.")].join(""),
        cta: { label: "Get three of these every Monday", url: `${env.appUrl}/signup` },
        footnote: HINT,
        ...common,
      }),
    };
  }
  if (stage === "past_three_weeks") {
    return {
      subject: `${brand}: ${plural(days ?? 21)} and still running`,
      html: renderEmail({
        preheader: `${brand}'s version of "${watch.title}" is past three weeks.`,
        title: "Past three weeks. Still paying for it.",
        intro: `${brand}'s version of "${watch.title}" has run ${plural(days ?? 21)}. Three weeks is the line the read counts as a strong hint.`,
        body: [rivalText ? paragraph(rivalText, INK) : "", paragraph("Want to know whether it's actually winning? Connect your ad account and TRND reads the real numbers, checks the ad against its brief, and writes the next three tests every Monday.")].join(""),
        cta: { label: "Connect it and keep score", url: `${env.appUrl}/signup` },
        footnote: HINT,
        ...common,
      }),
    };
  }
  if (stage === "ended") {
    return {
      subject: `${brand}: your test stopped${days !== null ? ` after ${plural(days)}` : ""}`,
      html: renderEmail({
        preheader: `${brand}'s version of "${watch.title}" is no longer running.`,
        title: days !== null ? `It ran ${plural(days)}.` : "It stopped.",
        intro: `${brand}'s version of "${watch.title}" is no longer in the Ad Library.${rivalText ? ` ${rivalText}` : ""}`,
        body: [
          paragraph("The Ad Library can't say whether the idea lost or the shoot did. TRND can: it checks the finished ad against its brief and reads your real numbers, so a loss tells you which."),
        ].join(""),
        cta: { label: "Find out why", url: `${env.appUrl}/signup` },
        footnote: HINT,
        ...common,
      }),
    };
  }
  return {
    subject: `${brand}: we never saw it go live`,
    html: renderEmail({
      preheader: `We stopped watching for "${watch.title}".`,
      title: "We never saw it go live.",
      intro: `It's been 45 days and we didn't find ${brand}'s version of "${watch.title}" in the Ad Library, so we've stopped looking.`,
      body: paragraph("If it ran with different words, we missed it: we spot a launch by the hook's words. Run a new read any time."),
      cta: { label: "Run a new read", url: `${env.appUrl}/` },
      ...common,
    }),
  };
}

export async function sendWatchEmail(watch: TestWatch, email: WatchEmail): Promise<boolean> {
  const res = await sendEmail({ to: watch.email, subject: email.subject, html: email.html });
  return res.ok;
}
