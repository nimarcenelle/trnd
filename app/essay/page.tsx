import Link from "next/link";
import { notFound } from "next/navigation";

import AccessLink from "@/components/admitted/access-link";
import EssayWorkspace from "@/components/admitted/essay-workspace";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { accessLink, paidSession } from "@/lib/admitted/access";
import { PROMPTS, wordLimit } from "@/lib/admitted/prompts";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Essays · Admitted" };

export default async function EssayPage({ searchParams }: PageProps<"/essay">) {
  if (!isEssayOpen) notFound();
  const session = await paidSession();
  const { welcome, school, p } = await searchParams;
  const picked = typeof school === "string" ? PROMPTS[school]?.prompts[Number(p)] : undefined;
  const start = picked ? { prompt: picked.text, limit: wordLimit(picked) } : undefined;
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
            <Link href="/odds" className="btn btn-ghost btn-sm">
              Odds
            </Link>
            <Link href="/activities" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Activities
            </Link>
            <Link href="/essay/final" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Final Read
            </Link>
            {!session && (
              <Link href="/pricing" className="btn btn-ghost btn-sm">
                Pricing
              </Link>
            )}
            {session && <AccessLink url={accessLink(session, env.siteUrl)} welcome={welcome === "1"} />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <EssayWorkspace paid={Boolean(session)} start={start} />
    </div>
  );
}
