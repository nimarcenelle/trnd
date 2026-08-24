import { redirect } from "next/navigation";

import OnboardingWizard from "@/components/onboarding/wizard";
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
        <span style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--disp)", fontWeight: 800, fontSize: 19 }}>
          <i style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 0 4px var(--mint-glow)" }} />
          TRND
        </span>
        <ThemeToggle />
      </nav>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
        <OnboardingWizard />
      </div>
    </main>
  );
}
