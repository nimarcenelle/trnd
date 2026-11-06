import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NicheSection, ReadSection } from "@/components/creator/check";
import DiagnosisCard from "@/components/creator/diagnosis-card";
import SiteNav from "@/components/site-nav";
import { SHARED_SRC } from "@/lib/creator/funnel";
import { diagnosis, stuckCount } from "@/lib/creator/stats";
import { getCheck, logEvent } from "@/lib/creator/store";

export const maxDuration = 300;

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const c = await getCheck((await params).id);
  if (!c?.stats) return { title: "TRND for creators" };
  const title = `${stuckCount(c.stats)} of @${c.handle}'s last ${c.stats.posts.length} posts never got past their followers`;
  return {
    title: `${title} — TRND`,
    description: c.read?.verdict ?? "Which of the last 12 posts broke out, which stalled, and why. Check yours free.",
    openGraph: { title, description: "Find out why yours flop, free, at usetrnd.com/creators" },
    twitter: { card: "summary_large_image", title },
    robots: { index: false },
  };
}

/**
 * A shared result. It shows the number, the chart and the pattern, keeps the
 * hooks for the creator it was made for, and puts the check right under it:
 * the viewer's next move is to run their own.
 */
export default async function SharedResultPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  const c = await getCheck(id);
  if (!c?.stats || !c.handle) notFound();
  await logEvent("share_view", { handle: c.handle, platform: c.platform, src: SHARED_SRC, meta: { id } });
  const when = new Date(c.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric" });

  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="wrap pt-10 sm:pt-16 pb-20 w-full">
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 lg:gap-14 items-start">
          <div className="rise">
            <DiagnosisCard handle={c.handle} platform={c.platform ?? "tiktok"} followers={c.followers} stats={c.stats} killer={c.read?.killer ?? c.read?.stop} benchmark={c.benchmark} voice="they" />
            <p className="caption mt-3">Checked {when}. Public posts only: likes, comments and shares against their own usual.</p>
          </div>
          <div className="flex flex-col gap-10">
            <div>
              <p className="kicker m-0">{diagnosis(c.stats, "their").replace(/^(\d+) of their/, `$1 of @${c.handle}'s`)}</p>
              <h1 className="display text-[34px] sm:text-[44px] mt-3 mb-0">Why do yours flop?</h1>
              <p className="text-[16px] text-ink-2 mt-3 mb-5 leading-[1.6] max-w-[520px]">
                Free, no account, about a minute. Find out exactly what&apos;s killing your posts, and what to post instead.
              </p>
              <form action="/creators" method="get" className="sitebox max-w-[520px]">
                <input type="hidden" name="src" value={SHARED_SRC} />
                <select name="platform" defaultValue={c.platform} aria-label="Platform" className="bg-transparent text-[14px] text-ink-2 outline-none border-0 pr-1">
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                </select>
                <span className="w-px h-5 bg-line-strong" aria-hidden />
                <input name="handle" placeholder="@yourhandle" aria-label="Your handle" autoComplete="off" required />
                <button className="btn btn-primary" type="submit">
                  Check mine
                </button>
              </form>
            </div>
            {c.read ? <ReadSection read={c.read} voice="they" hooks={false} benchmark={c.benchmark} /> : c.benchmark && <NicheSection b={c.benchmark} voice="they" />}
          </div>
        </div>
      </main>
      <footer className="border-t border-line">
        <div className="wrap py-6 text-[13px] text-ink-3 flex justify-between">
          <span>TRND for creators</span>
          <Link href="/creators" className="hover:text-ink">
            How the check works
          </Link>
        </div>
      </footer>
    </div>
  );
}
