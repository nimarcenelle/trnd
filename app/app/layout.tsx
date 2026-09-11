import "./app.css";

import Link from "next/link";
import { redirect } from "next/navigation";

import AppNav from "@/components/app/app-nav";
import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { getPlanState } from "@/lib/billing";
import { getUserRepo } from "@/lib/db";
import { isStripeConfigured } from "@/lib/env";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getUserRepo(user.id);
  const business = await repo.getBusinessByOwner(user.id);
  if (!business) redirect("/onboarding");
  const plan = await getPlanState(repo, business);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppNav businessName={business.name} signOut={signOutAction} />
      {isStripeConfigured && plan.locked && (
        <div className="demo-strip" role="status">
          <b>Trial ended.</b> Your campaigns stay yours. Pick a plan to keep building.{" "}
          <Link href="/app/settings#billing" style={{ color: "var(--amber-text)", fontWeight: 600 }}>
            Choose a plan
          </Link>
        </div>
      )}
      {isStripeConfigured && !plan.locked && plan.isTrialing && plan.trialDaysLeft <= 5 && (
        <div className="demo-strip" role="status">
          <b>Trial:</b> {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left.{" "}
          <Link href="/app/settings#billing" style={{ color: "var(--amber-text)", fontWeight: 600 }}>
            Choose a plan
          </Link>
        </div>
      )}
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
