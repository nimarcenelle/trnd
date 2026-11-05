import Link from "next/link";
import { notFound } from "next/navigation";

import AccessLink from "@/components/admitted/access-link";
import EssaySample from "@/components/admitted/essay-sample";
import EssayWorkspace from "@/components/admitted/essay-workspace";
import Brand from "@/components/brand";
import { IconCheck } from "@/components/icons";
import ThemeToggle from "@/components/theme-toggle";
import { accessLink, paidSession } from "@/lib/admitted/access";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Essays · Admitted" };

const INCLUDED = ["Line-by-line review of your draft", "Rewrite in your voice", "Unlimited revisions through the cycle", "Re-run odds whenever your numbers change"];

export default async function EssayPage({ searchParams }: PageProps<"/essay">) {
  if (!isEssayOpen) notFound();
  const session = await paidSession();
  const { welcome } = await searchParams;
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ground">
        <div className="flex items-center justify-between h-14 px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Brand />
            <span className="hidden sm:block h-4 w-px bg-line-strong" />
            <span className="hidden sm:block text-[13px] text-ink-2">Essays</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/#start" className="btn btn-ghost btn-sm">
              Odds
            </Link>
            {session && <AccessLink url={accessLink(session, env.siteUrl)} welcome={welcome === "1"} />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      {session ? (
        <EssayWorkspace />
      ) : (
        <main className="flex-1 bg-subtle">
          <div className="wrap py-14 sm:py-20 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 items-center">
            <div>
              <p className="kicker">Essays</p>
              <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Your essay, reviewed line by line.</h1>
              <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[480px]">The lines costing you most, marked in your draft, with what to do about each one. Then a rewrite in your voice.</p>
              <div className="mt-8">
                <EssaySample />
              </div>
            </div>
            <div className="card p-8 shadow-[var(--shadow-lg)]">
              <div className="text-[14px] font-semibold text-[var(--kicker)]">Essays</div>
              <div className="text-[40px] font-semibold tnum mt-3 leading-none">$299</div>
              <p className="text-[13px] text-ink-2 mt-2">Pay once per cycle. No subscription. Full refund within 14 days.</p>
              <ul className="list-none p-0 m-0 mt-6 flex flex-col gap-3 text-[14px]">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <IconCheck className="text-brand mt-[3px] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <form action="/api/essays/checkout" method="post">
                <button className="btn btn-primary btn-lg w-full mt-8" type="submit">
                  Fix the movable part
                </button>
              </form>
              <p className="caption text-center mt-3">Pay once. No subscription.</p>
              <p className="caption text-center mt-1">
                By paying you agree to the{" "}
                <Link className="underline hover:text-ink" href="/terms">
                  Terms
                </Link>{" "}
                and{" "}
                <Link className="underline hover:text-ink" href="/privacy">
                  Privacy Policy
                </Link>
                . Under 18? A parent or guardian must pay.
              </p>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
