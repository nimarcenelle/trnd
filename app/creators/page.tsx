import Link from "next/link";

import Brand from "@/components/brand";
import CreatorCheckForm from "@/components/creator/check";
import TypeCard from "@/components/creator/type-card";
import { SAMPLE_CREATORS } from "@/components/sample/creator";
import { ALL_TYPES, type CreatorTypeId } from "@/lib/creator/types";
import SiteNav from "@/components/site-nav";
import { cleanSrc } from "@/lib/creator/check";

export const metadata = {
  title: "Why your posts stall — TRND for creators",
  description: "A free check of your last 12 TikTok or Instagram posts: which broke out, which stalled, what separates them, and three hooks to post next.",
};
// The profile read and the written read together can take a minute or more.
export const maxDuration = 300;

/** The six types, for the landing page: what each looks like from the outside. */
const TYPE_COPY: Record<CreatorTypeId, { name: string; blurb: string }> = {
  hitmaker: { name: "The Hitmaker", blurb: "A third or more of their posts reach past their followers. Rare, and usually built on one opening that works." },
  climber: { name: "The Climber", blurb: "Breakouts are starting to come regularly, with few misses in between." },
  wild_card: { name: "The Wild Card", blurb: "Big hits and big misses on the same account. The difference is usually the first line." },
  one_hit: { name: "The One-Hit Wonder", blurb: "One post did most of the work. The question is whether they know why." },
  steady: { name: "The Steady", blurb: "Their crowd shows up for every post. None of them reach much further." },
  quiet: { name: "The Quiet Patch", blurb: "Nothing breaking out, and more posts stalling than usual. Fixable, starting with the opening." },
};

/** What most creators are never told, plainly. The authority before the ask. */
const TRUTHS = [
  {
    title: "Your followers are not your audience",
    body: "TikTok and Instagram tend to show a new post to a small group first, often people who already follow you, and only show it further when that group stays and reacts. A post that does 'fine' with your followers usually stops there.",
  },
  {
    title: "A few posts carry every account",
    body: "On most accounts a small share of posts brings in most of the engagement. The check shows your own split. Growth comes from making more of those, not from posting more of everything.",
  },
  {
    title: "The opening line decides it",
    body: "The breakouts and the stalls on the same account are often the same topic, said differently in the first two seconds. That is the cheapest thing you can change.",
  },
];

/** ?src= says which video or link sent the visitor; it rides along to every event they cause. */
export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const q = await searchParams;
  const src = cleanSrc(q.src);
  // Arriving with ?handle= (from a shared result or a link) starts the check at once.
  const handle = typeof q.handle === "string" ? q.handle.slice(0, 60) : "";
  const platform = q.platform === "instagram" ? "instagram" : "tiktok";
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />

      <section className="border-b border-line overflow-hidden">
        <div className="wrap pt-16 sm:pt-24 pb-16 sm:pb-24 flex flex-col items-center text-center">
          <p className="kicker">Free for creators</p>
          <h1 className="display text-[40px] sm:text-[58px] mt-4 max-w-[860px]">What kind of creator are you, really?</h1>
          <p className="text-[17px] sm:text-[18px] text-ink-2 leading-[1.6] mt-5 max-w-[600px]">
            Drop your handle. In about a minute: your posting type, what your best posts do that the rest don&apos;t, and three hooks to post next.
          </p>
          <div className="mt-8 w-full">
            <CreatorCheckForm
              src={src}
              handle={handle}
              platform={platform}
              sample={
                <div className="mt-16">
                  <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-6 -mx-4 px-4 sm:overflow-visible sm:justify-center sm:items-start">
                    {SAMPLE_CREATORS.map((c, i) => (
                      <div
                        key={c.handle}
                        className={`snap-center shrink-0 w-[min(300px,82vw)] rise ${["sm:-rotate-3 sm:translate-y-6", "sm:z-10", "sm:rotate-3 sm:translate-y-6"][i]}`}
                        style={{ animationDelay: `${i * 140}ms` }}
                      >
                        <TypeCard handle={c.handle} platform={c.platform} followers={c.followers} stats={c.stats} voice="they" compact />
                      </div>
                    ))}
                  </div>
                  <p className="caption mt-4">Examples from invented accounts. Yours reads your own last 12 posts.</p>
                </div>
              }
            />
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap py-16 sm:py-24">
          <p className="kicker">Six types</p>
          <h2 className="display text-[28px] sm:text-[36px] mt-3 max-w-[640px]">Every account has a shape. Most creators have never seen theirs.</h2>
          <ul className="list-none p-0 m-0 mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_TYPES.map((id) => {
              const t = TYPE_COPY[id];
              return (
                <li key={id} className="card p-5">
                  <div className="text-[19px] font-semibold tracking-[-0.02em]">{t.name}</div>
                  <p className="text-[14px] text-ink-2 leading-[1.55] mt-1.5 mb-0">{t.blurb}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="bg-subtle border-b border-line">
        <div className="wrap py-16 sm:py-24">
          <p className="kicker">What most creators aren&apos;t told</p>
          <h2 className="display text-[28px] sm:text-[34px] mt-3 max-w-[640px]">Posting more doesn&apos;t fix a stall. Knowing which posts travel does.</h2>
          <ol className="list-none p-0 m-0 mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {TRUTHS.map((t, i) => (
              <li key={t.title} className="border-t border-line pt-6">
                <span className="text-[13px] font-medium text-ink-3 tnum">0{i + 1}</span>
                <h3 className="heading text-[17px] mt-3">{t.title}</h3>
                <p className="text-[14.5px] text-ink-2 leading-[1.65] mt-2">{t.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="wrap py-16 sm:py-24 grid grid-cols-[minmax(0,1fr)] gap-10 md:grid-cols-2">
          <div>
            <p className="kicker">How the check works</p>
            <h2 className="display text-[28px] sm:text-[34px] mt-3">Measured against you, not a benchmark.</h2>
          </div>
          <dl className="m-0 flex flex-col gap-5 text-[14.5px] leading-[1.65]">
            {[
              ["Your usual", "The median likes, comments and shares across your last 12 public posts. Half your posts do better, half do worse."],
              ["Broke out", "A post at twice your usual or more. It reached past the people who always engage."],
              ["Stalled", "A post at half your usual or less. Even your regulars passed on it."],
              ["What we don't see", "Reach, saves and watch time are private to your account, so the check never claims them."],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold">{k}</dt>
                <dd className="m-0 text-ink-2 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="border-t border-line mt-auto">
        <div className="wrap py-8 flex flex-col sm:flex-row gap-4 justify-between sm:items-center text-[13px] text-ink-3">
          <div className="flex items-center gap-4">
            <Brand size={12} />
            <span>© {new Date().getFullYear()} TRND</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-ink">
              For brands
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
