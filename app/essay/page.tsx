import Link from "next/link";
import { notFound } from "next/navigation";

import AccessLink from "@/components/essayodds/access-link";
import EssayWorkspace from "@/components/essayodds/essay-workspace";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { accessLink, paidAccess } from "@/lib/essayodds/access";
import { PROMPTS, wordLimit } from "@/lib/essayodds/prompts";
import { env, isEssayOpen } from "@/lib/env";

export const metadata = { title: "Essays · EssayOdds" };

export default async function EssayPage({ searchParams }: PageProps<"/essay">) {
  if (!isEssayOpen) notFound();
  const access = await paidAccess();
  const session = access?.id ?? null;
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
            {access && <AccessLink url={accessLink(access.id, env.siteUrl)} welcome={welcome === "1"} until={access.until ? access.until.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }) : null} />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <EssayWorkspace paid={Boolean(session)} start={start} />
    </div>
  );
}
