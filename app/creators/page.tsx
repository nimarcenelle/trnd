import Link from "next/link";

import Brand from "@/components/brand";
import CreatorCheckForm from "@/components/creator/check";
import SiteNav from "@/components/site-nav";

export const metadata = {
  title: "Why your posts stall — TRND for creators",
  description: "A free check of your last 12 TikTok or Instagram posts: which broke out, which stalled, what separates them, and three hooks to post next.",
};
// The profile read and the written read together can take a minute or more.
export const maxDuration = 300;

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

export default function CreatorsPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />

      <section className="border-b border-line">
        <div className="wrap pt-16 sm:pt-24 pb-16 sm:pb-20 flex flex-col items-center text-center">
          <p className="kicker">For creators</p>
          <h1 className="display text-[38px] sm:text-[52px] mt-4 max-w-[820px]">Why do some of your posts take off and the rest don&apos;t?</h1>
          <p className="text-[17px] text-ink-2 leading-[1.6] mt-5 max-w-[620px]">
            Enter your handle. TRND reads your last 12 posts, measures each against your own usual, and shows you what your breakouts did that the rest
            didn&apos;t. Free, no account.
          </p>
          <div className="mt-8 w-full">
            <CreatorCheckForm />
          </div>
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
