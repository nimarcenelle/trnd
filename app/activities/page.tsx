import { notFound } from "next/navigation";

import ListReviewer from "@/components/essayodds/list-reviewer";
import AppHeader from "@/components/essayodds/app-header";
import { paidAccess } from "@/lib/essayodds/access";
import { isEssayOpen } from "@/lib/env";

export const metadata = {
  title: "Activity and honors list review · EssayOdds",
  description: "Paste your Common App activities or honors. Every entry gets scored, the weakest is named, and a tighter version fits the field.",
};

export default async function ActivitiesPage() {
  if (!isEssayOpen) notFound();
  const paid = Boolean(await paidAccess());
  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />
      <main className="flex-1 bg-subtle">
        <div className="wrap py-14 sm:py-20">
          <p className="kicker">Activities and honors</p>
          <h1 className="section-title text-[32px] sm:text-[40px] mt-3 max-w-[720px]">Find the entry doing the least work.</h1>
          <p className="text-[16px] text-ink-2 leading-[1.65] mt-4 max-w-[640px]">
            Paste your Common App list. Our AI scores every entry, names the weakest and offers a tighter version that fits the field. It only uses your facts: a rewrite with a number you didn&apos;t give is thrown out. Included with every pass.
          </p>
          <div className="mt-10">
            <ListReviewer paid={paid} />
          </div>
        </div>
      </main>
    </div>
  );
}
