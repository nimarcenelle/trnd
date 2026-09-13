import { redirect } from "next/navigation";

import OnboardingWizard from "@/components/onboarding/wizard";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/auth/session";
import { getUserRepo } from "@/lib/db";

export const metadata = { title: "Set up your business — TRND" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (business) redirect("/app/picks");

  return (
    <main className="min-h-dvh flex flex-col">
      <nav className="flex items-center justify-between py-4 px-8 border-b border-line"
       
      >
        <Brand href={null} />
        <ThemeToggle />
      </nav>
      <div className="flex-1 flex flex-col items-center justify-center py-12 px-5">
        <div className="w-full max-w-[620px] mb-5">
          <span className="eyebrow m-0">Set up</span>
          <h1 className="h-disp text-[28px] mx-0 mt-2 mb-1">Tell TRND about your brand.</h1>
          <p className="text-[14.5px] text-ink-soft m-0 leading-[1.55]">
            About two minutes. Your first pick is written while you read the analysis.
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </main>
  );
}
