import { redirect } from "next/navigation";

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
    <section id={id} className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] py-10 border-t border-line first:border-t-0 first:pt-0">
      <div>
        <h2 className="disp text-[18px]">{title}</h2>
        {sub && <p className="text-[13.5px] text-ink-3 mt-2 leading-[1.55]">{sub}</p>}
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
    <div className="max-w-[1000px]">
      <span className="label">Settings</span>
      <h1 className="disp text-[clamp(30px,4vw,44px)] mt-3 mb-12">Rivals &amp; settings</h1>

      <Section title="Your brand" sub="What TRND compares every rival against.">
        <div className="panel p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold">{brand.name}</div>
            <div className="text-[13px] text-ink-3">{brand.url}</div>
            {brand.summary && <p className="text-[14px] text-ink-2 mt-3 leading-[1.6]">{brand.summary}</p>}
          </div>
          <a className="btn btn-ghost btn-sm shrink-0" href="/app/setup?again=1">
            Change site
          </a>
        </div>
      </Section>

      <Section
        title="Rivals watched"
        sub={
          <>
            {rivals.length} of {MAX_RIVALS}. A new rival is read on the next scan.
          </>
        }
      >
        <div className="panel">
          <RivalList rivals={rivals} />
          <div className="border-t border-line p-4 sm:p-5 bg-bg-2/50 rounded-b-xl">
            <AddRivalForm />
          </div>
        </div>
      </Section>

      <Section id="billing" title="Plan" sub="One plan, cancel anytime.">
        <div className="panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <i className={`dot ${plan.locked ? "dot-rec" : ""}`} />
              <span className="font-semibold">
                {plan.paid ? `TRND · ${PRICE_LABEL}` : plan.locked ? "Trial ended" : `Free trial · ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left`}
              </span>
            </div>
            {brand.plan_status === "past_due" && <p className="text-rec text-[14px] mt-2">Your last payment failed. Update your card to keep scans running.</p>}
            {billing === "success" && <p className="text-mint text-[14px] mt-2">Thanks. Your plan is active.</p>}
            {!isStripeConfigured && <p className="text-ink-3 text-[13px] mt-2">Billing isn&apos;t connected on this deployment.</p>}
          </div>
          {isStripeConfigured &&
            (brand.stripe_customer_id ? (
              <form action={billingPortalAction}>
                <SubmitButton className="btn btn-ghost">Manage billing</SubmitButton>
              </form>
            ) : (
              <form action={checkoutAction}>
                <SubmitButton pending="Opening Stripe…">Subscribe · {PRICE_LABEL}</SubmitButton>
              </form>
            ))}
        </div>
      </Section>
    </div>
  );
}
