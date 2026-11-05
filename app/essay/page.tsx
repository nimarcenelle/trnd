import Link from "next/link";
import { notFound } from "next/navigation";

import AccessLink from "@/components/admitted/access-link";
import EssayWorkspace from "@/components/admitted/essay-workspace";
import Brand from "@/components/brand";
import { IconCheck } from "@/components/icons";
import ThemeToggle from "@/components/theme-toggle";
import { accessLink, paidSession } from "@/lib/admitted/access";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Review your essay" };

const INCLUDED = ["A scored review of every draft, with the weak lines marked", "A rewrite from your own draft, and revisions through the cycle", "Personal statement and every supplement"];

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
            <span className="h-4 w-px bg-line-strong" />
            <span className="text-[13px] text-ink-2">Essays</span>
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
        <main className="flex-1 bg-subtle flex items-center justify-center px-5 py-14">
          <div className="card w-full max-w-[440px] p-8 shadow-[var(--shadow-lg)]">
            <div className="text-[14px] font-semibold text-[var(--kicker)]">Essays, reviewed and rewritten</div>
            <div className="text-[40px] font-semibold tnum mt-3 leading-none">$299</div>
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
                Pay $299
              </button>
            </form>
            <p className="caption text-center mt-3">Paid once per cycle. No subscription.</p>
          </div>
        </main>
      )}
    </div>
  );
}
