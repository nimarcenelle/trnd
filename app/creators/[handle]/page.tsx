import type { Metadata } from "next";
import Link from "next/link";

import Avatar from "@/components/app/avatar";
import GapCard from "@/components/app/gap-card";
import { IDEA_TYPE } from "@/components/app/idea-card";
import { StageBar, STAGE_LABEL } from "@/components/app/stage";
import StartForm from "@/components/preview/start-form";
import SiteNav from "@/components/site-nav";
import { gapOf, postsPerMonth, typicalByAuthor } from "@/lib/creators/gap";
import { aheadLine, callable, normalOf, timesNormal, trendList } from "@/lib/creators/stats";
import { compact, times } from "@/lib/format";
import { onScreenHook } from "@/lib/preview/next-tiktok";
import { asVideo, latestReadyPreview } from "@/lib/preview/run";
import { normHandle } from "@/lib/tiktok/read";

/**
 * A public, indexable read of any handle TRND has previewed in the last 30
 * days: the free tier's numbers, the gap, the creators ahead, what's rising and
 * the first idea's hook with why it works. Never the script itself. The page is
 * also TRND's own content format: "I ran @handle through TRND. Here's what it
 * told them to post." The creator can claim it, or ask for it to come down.
 */

/** The plan speaks to its creator; this page speaks about them. */
const theirs = (t: string) => t.replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/\byou're\b/g, "they're").replace(/\byou\b/g, "they").replace(/\bYou\b/g, "They");

const handleOf = async (params: Promise<{ handle: string }>) => normHandle(decodeURIComponent((await params).handle));

export async function generateMetadata({ params }: PageProps<"/creators/[handle]">): Promise<Metadata> {
  const handle = await handleOf(params);
  const p = handle ? await latestReadyPreview(handle) : null;
  if (!p?.plan) return { title: `@${handle} — TRND for creators`, robots: { index: false } };
  const title = `We ran @${handle} through TRND. Here's what it told them to post.`;
  return {
    title,
    description: `@${handle}'s typical TikTok, the creators a step ahead of them, what's rising in their niche, and the first video TRND would have them make next.`,
    openGraph: { title, url: `/creators/@${handle}` },
    alternates: { canonical: `/creators/@${handle}` },
  };
}

export default async function PublicCreatorPage({ params }: PageProps<"/creators/[handle]">) {
  const handle = await handleOf(params);
  const p = handle ? await latestReadyPreview(handle) : null;

  if (!p?.plan) {
    return (
      <div>
        <SiteNav />
        <main className="wrap py-16 sm:py-24 grid gap-6 max-w-[620px]">
          <h1 className="display text-[clamp(28px,4.5vw,40px)]">We haven&apos;t read @{handle} yet</h1>
          <p className="text-ink-2 text-[16px] m-0">Run it now: their typical video, the creators a step ahead of them, and the first video to make next. Free, public data only.</p>
          <StartForm cta="Plan the next 3 posts" defaultHandle={handle} />
        </main>
      </div>
    );
  }

  const own = p.videos.map((v) => asVideo(v, p.handle));
  const normal = normalOf(own);
  const best = own.map((v) => timesNormal(v.views, normal) ?? 0).sort((a, b) => b - a)[0] ?? null;
  const sample = p.sample.map((v) => asVideo(v, p.handle));
  const typical = typicalByAuthor(sample);
  const gap = gapOf(
    { followers: p.author?.followers ?? null, typical: normal.views },
    p.peers.map((x) => ({ followers: x.followers, typical: typical.get(x.handle) ?? null })),
    postsPerMonth(p.videos.map((v) => v.postedAt)),
  );
  const first = p.plan.ideas[0];
  const claim = `/signup?handle=${encodeURIComponent(p.handle)}`;

  return (
    <div>
      <SiteNav />
      <main className="wrap py-10 sm:py-14 grid gap-6 max-w-[920px]">
        <div className="grid gap-3">
          <span className="kicker">A TRND read · public data only</span>
          <h1 className="display text-[clamp(28px,4.5vw,42px)]">We ran @{p.handle} through TRND. Here&apos;s what it told them to post.</h1>
          <div className="flex items-center gap-3 mt-1">
            <Avatar name={p.handle} size={40} />
            <div className="text-ink-2 text-[14.5px]">
              @{p.handle}
              {p.author?.followers ? ` · ${compact(p.author.followers)} followers` : ""} · read {new Date(p.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card px-4 py-3.5">
            <div className="label">Their typical video</div>
            <div className="stat-num my-1.5">{compact(normal.views)}</div>
            <div className="caption">views, from their last {own.length}</div>
          </div>
          <div className="card px-4 py-3.5">
            <div className="label">Their best recent</div>
            <div className="stat-num my-1.5">{best ? times(best) : "—"}</div>
            <div className="caption">their usual views</div>
          </div>
        </div>

        {gap && <GapCard gap={gap} voice="they" />}

        {first && (
          <section className="card p-5 sm:p-6 grid gap-3">
            <span className={`${IDEA_TYPE[first.type].cls} self-start`}>The first video TRND would have them make</span>
            <div className="heading text-[clamp(20px,3vw,26px)] leading-snug">&ldquo;{onScreenHook(first.hook)}&rdquo;</div>
            <div className="label mt-1">Why it works</div>
            <ul className="list-disc pl-5 m-0 grid gap-1.5 text-[15px] text-ink-2">
              {first.why.slice(0, 3).map((w) => (
                <li key={w}>{theirs(w)}</li>
              ))}
            </ul>
            <p className="caption m-0">The full script, the sound and when to post are in @{p.handle}&apos;s own plan.</p>
          </section>
        )}

        <div className="grid gap-3.5 md:grid-cols-2">
          {p.peers.length > 0 && (
            <div className="card p-4 grid gap-3 content-start">
              <div className="font-bold">Creators ahead of @{p.handle}</div>
              {p.peers.slice(0, 4).map((x) => (
                <div key={x.handle} className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={x.handle} size={30} ring />
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px]">@{x.handle}</div>
                    <div className="caption line-clamp-1">{[aheadLine(x.followers, p.author?.followers ?? null)?.replace("your", "their"), `${compact(x.followers)} followers`].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {trendList(p.trends).filter(callable).length > 0 && (
            <div className="card p-4 grid gap-3 content-start">
              <div className="font-bold">Rising in their niche</div>
              {trendList(p.trends)
                .filter(callable)
                .slice(0, 4)
                .map((t) => (
                  <div key={`${t.kind}:${t.key}`} className="flex items-center justify-between gap-3">
                    <span className={`min-w-0 ${t.kind === "hashtag" ? "mono text-[13.5px]" : "text-[14px]"}`}>{t.label}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <StageBar stage={t.stage} />
                      <span className="caption w-14">{STAGE_LABEL[t.stage]}</span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <section className="card p-5 sm:p-6 grid gap-4 sm:grid-cols-2 items-center">
          <div>
            <div className="font-bold text-[17px]">Is this you, @{p.handle}?</div>
            <p className="text-ink-2 text-[14.5px] mt-1 m-0">Claim it free: one scripted idea a week, or all three on Creator.</p>
          </div>
          <Link href={claim} className="btn btn-primary btn-lg sm:justify-self-end">
            Claim @{p.handle}
          </Link>
        </section>

        <section className="grid gap-3">
          <h2 className="heading text-[18px]">Run your own</h2>
          <div className="max-w-[560px]">
            <StartForm cta="Plan my next 3 posts" />
          </div>
        </section>

        <p className="caption m-0">
          Made from @{p.handle}&apos;s public TikTok videos only. Your account and want this page down?{" "}
          <a className="underline" href={`mailto:hello@usetrnd.com?subject=${encodeURIComponent(`Remove /creators/@${p.handle}`)}`}>
            Email us
          </a>{" "}
          and it comes down within a day.
        </p>
      </main>
    </div>
  );
}
