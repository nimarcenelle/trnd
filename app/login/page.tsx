import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

import LoginForm from "@/components/essayodds/login-form";
import SiteNav from "@/components/site-nav";
import { currentSession } from "@/lib/essayodds/auth";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "Log in · EssayOdds", robots: { index: false } };

/** Only same-site paths, so a crafted link can't bounce someone elsewhere after signing in. */
const safeNext = (value: unknown) => (typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/essay");

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isEssayOpen) notFound();
  const { email, next } = await searchParams;
  const target = safeNext(next);
  if (await currentSession()) redirect(target);
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="flex-1 wash-top">
        <div className="wrap py-16 sm:py-24 max-w-[440px]">
          <h1 className="section-title text-[32px] sm:text-[40px]">Log in to EssayOdds</h1>
          <p className="text-[16px] text-ink-2 leading-[1.65] mt-3">Your essays, lists and pass, on any device. No password: we email you a code.</p>
          <div className="mt-8">
            <LoginForm email={typeof email === "string" ? email : ""} next={target} />
          </div>
        </div>
      </main>
    </div>
  );
}
