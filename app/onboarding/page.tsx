import "@/app/read.css";
import "./onboarding.css";

import { redirect } from "next/navigation";

import Brand from "@/components/brand";
import OnboardingWizard from "@/components/onboarding/wizard";
import UrlStart from "@/components/onboarding/url-start";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

export const metadata = { title: "Set up — TRND" };
/** The URL start reads the site inside the action, then names rivals and reads every ad behind the redirect. */
export const maxDuration = 300;

/**
 * Setup is one field: your store's address (lib/onboarding/from-url.ts).
 * The longer wizard, with the context a brief can use, is kept at
 * ?full=1; Settings holds the same fields for later.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (business) redirect("/app/rivals");
  const { full } = await searchParams;

  if (full === "1") {
    return (
      <main className="rd min-h-dvh flex flex-col">
        <nav className="rd-nav">
          <Brand href={null} />
        </nav>
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-5">
          <OnboardingWizard />
        </div>
      </main>
    );
  }

  return (
    <main className="rd ob">
      <div className="rd-atmos" aria-hidden="true" />
      <nav className="rd-nav">
        <Brand href={null} />
      </nav>
      <section className="ob-hero">
        <span className="rd-kicker rd-kicker--gold">One step</span>
        <h1>
          Your store&rsquo;s address. <em>We&rsquo;ll find the rest.</em>
        </h1>
        <p className="rd-soft ob-sub">
          Your products, your socials and your live ads. Then your top competitors, and a camera on every ad they run, read every day.
        </p>
        <UrlStart />
      </section>
    </main>
  );
}
