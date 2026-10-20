import Link from "next/link";
import { redirect } from "next/navigation";

import Avatar from "@/components/app/avatar";
import { AddPeerForm, GoalsForm, HashtagsForm } from "@/components/app/forms";
import SubmitButton from "@/components/app/submit-button";
import { billingPortalAction, disconnectTiktokAction, removePeerAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { intervalOf, planState, PRICES } from "@/lib/billing";
import { getCreator, listPeers } from "@/lib/data";
import { MAX_PEERS } from "@/lib/db/types";
import { isStripeConfigured, isTiktokLoginConfigured } from "@/lib/env";
import { compact, shortDate } from "@/lib/format";

export const metadata = { title: "Settings — TRND for creators" };
// A handle change from here starts a read after the response, inside this route's time limit.
export const maxDuration = 300;

function Section({ id, title, sub, children }: { id?: string; title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] py-8 border-t border-line scroll-mt-16">
      <div>
        <h2 className="text-[15px] font-bold">{title}</h2>
        {sub && <p className="text-[13.5px] text-ink-2 mt-1 leading-[1.55]">{sub}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const TIKTOK_NOTE: Record<string, { text: string; tone: "pos" | "neg" }> = {
  connected: { text: "Connected. Your own numbers now come straight from TikTok.", tone: "pos" },
  denied: { text: "TikTok didn't confirm the connection. Try again.", tone: "neg" },
  failed: { text: "TikTok answered with an error. Try again in a minute.", tone: "neg" },
  unavailable: { text: "Connecting TikTok isn't set up on this deployment yet.", tone: "neg" },
};

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const [peers, { billing, tiktok, as }] = await Promise.all([listPeers(creator.id), searchParams]);
  const plan = planState(creator);
  const note =
    tiktok === "mismatch"
      ? { text: `That was @${String(as ?? "another account")}, not @${creator.handle}. Connect the account you track, or change your handle first.`, tone: "neg" as const }
      : typeof tiktok === "string"
        ? TIKTOK_NOTE[tiktok]
        : undefined;

  return (
    <div className="max-w-[960px]">
      <h1 className="heading text-[24px]">Settings</h1>
      <p className="text-ink-2 mt-1 mb-6">Your account, what you&apos;re posting for, who you learn from, and your plan.</p>

      <Section title="Your account" sub="The TikTok account every plan is written for.">
        <div className="card p-4 flex items-start gap-3 flex-wrap">
          <Avatar name={creator.handle} size={40} />
          <div className="min-w-0 flex-1">
            <div className="font-bold">@{creator.handle}</div>
            <div className="caption">
              {compact(creator.followers)} followers · {compact(creator.hearts)} likes · {compact(creator.videos)} videos
            </div>
            {creator.profile && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {creator.profile.niche.map((n) => (
                  <span key={n} className="chip">
                    {n}
                  </span>
                ))}
                {creator.profile.works.map((w) => (
                  <span key={w} className="chip chip-own">
                    {w}
                  </span>
                ))}
                {creator.profile.doesnt.map((w) => (
                  <span key={w} className="chip chip-miss">
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link className="btn btn-sm shrink-0" href="/app/setup?again=1">
            Change handle
          </Link>
        </div>
      </Section>

      <Section id="goals" title="Your goal" sub="Every idea is ranked against it.">
        <div className="card p-4 sm:p-5">
          <GoalsForm goals={creator.goals} />
        </div>
      </Section>

      <Section id="hashtags" title="Niche hashtags" sub="Where we look for trends and creators ahead of you. Specific beats broad: #collegeapps, not #fyp. Up to 8.">
        <div className="card p-4">
          <HashtagsForm hashtags={creator.hashtags} />
        </div>
      </Section>

      <Section title="Creators ahead of you" sub={`${peers.length} of ${MAX_PEERS}. Matched from your niche, a step or two bigger than you. Add anyone you want to be like.`}>
        <div className="card divide-y divide-line">
          {peers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={p.handle} size={30} />
              <div className="min-w-0 flex-1">
                <Link href={`/app/creators/${p.handle}`} className="font-semibold hover:underline break-all">
                  @{p.handle}
                </Link>
                <div className="caption">
                  {compact(p.followers)} followers · {p.source === "owner" ? "added by you" : p.reason}
                  {p.last_error ? ` · ${p.last_error}` : ""}
                </div>
              </div>
              <form action={removePeerAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  Remove
                </button>
              </form>
            </div>
          ))}
          <div className="p-4 bg-subtle rounded-b-[14px]">
            <AddPeerForm />
          </div>
        </div>
      </Section>

      <Section
        id="tiktok"
        title="Connect TikTok"
        sub="Optional. Without it we read your public profile, which already gives views, likes, comments, shares and saves."
      >
        <div className="card p-4 grid gap-3">
          {note && <p className={`text-[14px] ${note.tone === "pos" ? "text-pos" : "text-neg"}`}>{note.text}</p>}
          {creator.tiktok_connected_at ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[14px]">
                <span className="pill pill-pos mr-2">Connected</span>since {shortDate(creator.tiktok_connected_at)}
              </span>
              <form action={disconnectTiktokAction}>
                <SubmitButton className="btn btn-sm">Disconnect</SubmitButton>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[14px] text-ink-2 max-w-[52ch]">
                Connecting lets your own numbers come straight from TikTok and verifies the account is yours. Watch-through, retention and followers per video need TikTok&apos;s business
                analytics, which we&apos;re adding next.
              </p>
              {isTiktokLoginConfigured ? (
                <a className="btn btn-primary" href="/api/tiktok/connect">
                  Connect TikTok
                </a>
              ) : (
                <span className="pill">Coming soon</span>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section id="billing" title="Plan" sub="Everything included, weekly or monthly. Cancel anytime.">
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-bold">
              {plan.paid
                ? `TRND for creators · ${PRICES[intervalOf(creator.plan) ?? "monthly"].label}`
                : plan.trialing
                  ? `Free trial · ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left, then ${PRICES[intervalOf(creator.plan) ?? "monthly"].label}`
                  : plan.canTrial
                    ? "Free plan · one script a week"
                    : plan.locked
                      ? "Paused"
                      : "Free trial"}
            </div>
            {creator.plan_status === "past_due" && <p className="text-neg text-[13.5px] mt-1">Your last payment failed. Update your card to keep daily reads running.</p>}
            {billing === "success" && <p className="text-pos text-[13.5px] mt-1">Thanks. Your plan is active.</p>}
            {!isStripeConfigured && <p className="text-ink-3 text-[13.5px] mt-1">Billing isn&apos;t connected on this deployment.</p>}
          </div>
          {isStripeConfigured &&
            ((plan.paid || plan.trialing) && creator.stripe_customer_id ? (
              <form action={billingPortalAction}>
                <SubmitButton className="btn">{plan.trialing ? "Manage or cancel" : "Manage billing"}</SubmitButton>
              </form>
            ) : (
              <Link href="/app/welcome?step=trial" className="btn btn-primary">
                {plan.canTrial ? "Start free trial" : "Choose a plan"}
              </Link>
            ))}
        </div>
      </Section>
    </div>
  );
}
