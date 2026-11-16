import { notFound } from "next/navigation";

import RecoverForm from "@/components/admitted/recover-form";
import SiteNav from "@/components/site-nav";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "Get your access link · Admitted", robots: { index: false } };

export default function RecoverPage() {
  if (!isEssayOpen) notFound();
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="flex-1 wash-top">
        <div className="wrap py-16 sm:py-24 max-w-[560px]">
          <h1 className="section-title text-[32px] sm:text-[40px]">Get your access link.</h1>
          <p className="text-[16px] text-ink-2 leading-[1.65] mt-4">New device or cleared your browser? Enter the email used at checkout and we&apos;ll send your link again.</p>
          <div className="mt-8">
            <RecoverForm />
          </div>
        </div>
      </main>
    </div>
  );
}
