import { redirect } from "next/navigation";

import Avatar from "@/components/app/avatar";
import { AddRivalForm } from "@/components/app/forms";
import RivalList from "@/components/app/rival-list";
import SubmitButton from "@/components/app/submit-button";
import { billingPortalAction, checkoutAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState, PRICE_LABEL } from "@/lib/billing";
import { getBrand, listRivals } from "@/lib/data";
import { MAX_RIVALS } from "@/lib/db/types";
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

  return (
    <div className="max-w-[960px]">
      <h1 className="heading text-[22px]">Rivals &amp; settings</h1>
      <p className="text-[13px] text-ink-3 mt-0.5 mb-8">Who you watch, and your plan.</p>

      <Section title="Your brand" sub="What every competitor is compared against.">
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

      <Section title="Competitors" sub={`${rivals.length} of ${MAX_RIVALS}. New competitors are read on the next scan.`}>
        <div className="card">
          <RivalList rivals={rivals} social />
          <div className="border-t border-line p-4 bg-subtle rounded-b-xl">
            <AddRivalForm />
          </div>
        </div>
      </Section>

      <Section id="billing" title="Plan" sub="One plan. Cancel anytime.">
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-semibold">
              {plan.paid ? `TRND · ${PRICE_LABEL}` : plan.locked ? "Trial ended" : `Free trial · ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left`}
            </div>
            {brand.plan_status === "past_due" && <p className="text-neg text-[13px] mt-1">Your last payment failed. Update your card to keep scans running.</p>}
            {billing === "success" && <p className="text-pos text-[13px] mt-1">Thanks. Your plan is active.</p>}
            {!isStripeConfigured && <p className="text-ink-3 text-[13px] mt-1">Billing isn&apos;t connected on this deployment.</p>}
          </div>
          {isStripeConfigured &&
            (brand.stripe_customer_id ? (
              <form action={billingPortalAction}>
                <SubmitButton className="btn btn-secondary">Manage billing</SubmitButton>
              </form>
            ) : (
              <form action={checkoutAction}>
                <SubmitButton className="btn btn-primary" pending="Opening Stripe…">
                  Subscribe · {PRICE_LABEL}
                </SubmitButton>
              </form>
            ))}
        </div>
      </Section>
    </div>
  );
}
