import { redirect } from "next/navigation";

import Avatar from "@/components/app/avatar";
import { AddRivalForm } from "@/components/app/forms";
import RivalList from "@/components/app/rival-list";
import SubmitButton from "@/components/app/submit-button";
import { billingPortalAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState, PLANS, priceLabel, rivalLimit } from "@/lib/billing";
import { getBrand, listRivals } from "@/lib/data";
import { isStripeConfigured } from "@/lib/env";

export const metadata = { title: "Settings — TRND" };

function Section({ id, title, sub, children }: { id?: string; title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] py-8 border-t border-line">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {sub && <p className="text-[13px] text-ink-3 mt-1 leading-[1.55]">{sub}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const [rivals, { billing }] = await Promise.all([listRivals(brand.id), searchParams]);
  const plan = planState(brand);
  const limit = rivalLimit(brand);
  const current = PLANS[plan.tier];
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const status = plan.paid
    ? `${current.name} · ${priceLabel(plan.tier)}${plan.trialDaysLeft > 0 ? ` · trial, ${days(plan.trialDaysLeft)} left` : ""}`
    : plan.locked
      ? brand.plan === "trial"
        ? "Trial ended"
        : "No active plan"
      : `Free trial · ${days(plan.trialDaysLeft)} left`;

  return (
    <div className="max-w-[960px]">
      <h1 className="heading text-[22px]">Rivals &amp; settings</h1>
      <p className="text-[13px] text-ink-3 mt-0.5 mb-8">Who you watch, and your plan.</p>

      <Section title="Business DNA" sub="What every competitor is compared against.">
        <div className="card p-4 flex items-start gap-3">
          <Avatar name={brand.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{brand.name}</div>
            <div className="text-[12.5px] text-ink-3">{brand.url}</div>
            {brand.summary && <p className="text-[13px] text-ink-2 mt-2 leading-[1.6]">{brand.summary}</p>}
          </div>
          <a className="btn btn-secondary btn-sm shrink-0" href="/app/setup?again=1">
            Change
          </a>
        </div>
      </Section>

      <Section
        title="Competitors"
        sub={
          rivals.length > limit
            ? `${current.name} watches the first ${limit} on this list. Remove one to promote the next, or move to Growth for 10.`
            : `${rivals.length} of ${limit} on ${current.name}. New competitors are read on the next scan.`
        }
      >
        <div className="card">
          <RivalList rivals={rivals} social={plan.tier === "growth"} watched={limit} />
          <div className="border-t border-line p-4 bg-subtle rounded-b-xl">
            <AddRivalForm />
          </div>
        </div>
      </Section>

      <Section id="billing" title="Plan" sub={`${current.name} scans ${current.cadence}. Cancel anytime.`}>
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-semibold">{status}</div>
            {plan.paid && plan.trialDaysLeft > 0 && <p className="text-ink-3 text-[13px] mt-1">Your card is charged when the trial ends. Cancel before then and you pay nothing.</p>}
            {brand.plan_status === "past_due" && <p className="text-neg text-[13px] mt-1">Your last payment failed. Update your card to keep scans running.</p>}
            {billing === "success" && <p className="text-pos text-[13px] mt-1">Thanks. Your plan is active.</p>}
            {!isStripeConfigured && <p className="text-ink-3 text-[13px] mt-1">Billing isn&apos;t connected on this deployment.</p>}
          </div>
          {isStripeConfigured && (
            <div className="flex gap-2 shrink-0">
              {plan.paid && plan.tier === "starter" && (
                <form action={billingPortalAction}>
                  <SubmitButton className="btn btn-primary" pending="Opening Stripe…">
                    Move to Growth
                  </SubmitButton>
                </form>
              )}
              {brand.stripe_customer_id && (plan.paid || brand.plan_status === "past_due") ? (
                <form action={billingPortalAction}>
                  <SubmitButton className="btn btn-secondary">Manage billing</SubmitButton>
                </form>
              ) : (
                <a className="btn btn-primary" href="/app/plan">
                  Choose a plan
                </a>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
