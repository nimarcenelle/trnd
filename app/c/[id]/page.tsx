import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadSection } from "@/components/creator/check";
import { ResultCard } from "@/components/creator/visuals";
import SiteNav from "@/components/site-nav";
import { toCard } from "@/lib/creator/card";
import { SHARED_SRC } from "@/lib/creator/funnel";
import { headline } from "@/lib/creator/stats";
import { getCheck, logEvent } from "@/lib/creator/store";

export const maxDuration = 300;

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const c = await getCheck((await params).id);
  if (!c?.stats) return { title: "TRND for creators" };
  const title = `@${c.handle}: ${c.stats.breakouts} of ${c.stats.posts.length} posts broke out`;
  return {
    title: `${title} — TRND`,
    description: c.read?.verdict ?? "Which of the last 12 posts broke out, which stalled, and why. Check yours free.",
    openGraph: { title, description: "Check yours free at usetrnd.com/creators" },
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
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
          <div className="rise">
            <ResultCard d={toCard(c)} voice="they" />
            <p className="caption mt-3">Checked {when}. Public posts only: likes, comments and shares against their own usual.</p>
          </div>
          <div className="flex flex-col gap-3">
            <p className="kicker m-0">@{c.handle}&apos;s last {c.stats.posts.length} posts</p>
            <h1 className="heading text-[24px] sm:text-[28px] m-0">{headline(c.stats, "their")}</h1>
            {c.read && <ReadSection read={c.read} voice="they" hooks={false} />}
            <div className="card p-5 mt-2 bg-subtle">
              <div className="text-[16px] font-semibold">What about yours?</div>
              <p className="text-[14px] text-ink-2 mt-1 mb-4 leading-[1.55]">
                Free, no account. Your last 12 posts, what your breakouts did that the rest didn&apos;t, and three hooks to post next.
              </p>
              <form action="/creators" method="get" className="sitebox">
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
