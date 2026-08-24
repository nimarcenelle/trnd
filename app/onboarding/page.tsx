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
  if (business) redirect("/app");

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Brand href={null} />
        <ThemeToggle />
      </nav>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
        <OnboardingWizard />
      </div>
    </main>
  );
}
