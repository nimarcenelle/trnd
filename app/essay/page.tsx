import { notFound } from "next/navigation";

import EssayForm from "@/components/admitted/essay-form";
import SiteNav from "@/components/site-nav";
import { env } from "@/lib/env";

export const metadata = { title: "Review your essay" };

export default function EssayPage() {
  if (!env.essayRewritesEnabled) notFound();
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="wrap py-14">
        <p className="kicker">Essays</p>
        <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Your essay, reviewed line by line.</h1>
        <EssayForm />
      </main>
    </div>
  );
}
