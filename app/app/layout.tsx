import "./app.css";
import "../read.css";

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
  const business = await repo.getBusinessForUser(user);
  if (!business) redirect("/onboarding");
  const [plan, competitors] = await Promise.all([getPlanState(repo, business), repo.listCompetitors(business.id).catch(() => [])]);

  return (
    <div className="rd ap">
      <AppNav businessName={business.name} website={business.website} watching={competitors.length} signOut={signOutAction} />
      <div className="ap-main">
      {isStripeConfigured && plan.locked && (
        <div className="demo-strip" role="status">
          <b>Trial ended.</b> Your briefs stay yours. Pick a plan to keep the weekly tests coming.{" "}
          <Link className="text-(--amber-text) font-semibold" href="/app/settings#billing">
            Choose a plan
          </Link>
        </div>
      )}
      {isStripeConfigured && !plan.locked && plan.isTrialing && plan.trialDaysLeft <= 5 && (
        <div className="demo-strip" role="status">
          <b>Trial:</b> {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left.{" "}
          <Link className="text-(--amber-text) font-semibold" href="/app/settings#billing">
            Choose a plan
          </Link>
        </div>
      )}
        <main>{children}</main>
      </div>
    </div>
  );
}
