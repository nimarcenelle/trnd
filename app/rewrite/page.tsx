import { notFound } from "next/navigation";

import RewriteForm from "@/components/admitted/rewrite-form";
import SiteNav from "@/components/site-nav";
import { env } from "@/lib/env";

export const metadata = { title: "Rewrite your essay" };

export default function RewritePage() {
  if (!env.essayRewritesEnabled) notFound();
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav />
      <main className="wrap py-14">
        <p className="kicker">Essays</p>
        <h1 className="section-title text-[32px] sm:text-[40px] mt-3">Your essay, rewritten from your draft.</h1>
        <RewriteForm />
      </main>
    </div>
  );
}
