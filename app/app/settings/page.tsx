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

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const [rivals, { billing }] = await Promise.all([listRivals(brand.id), searchParams]);
  const plan = planState(brand);

  return (
    <div className="max-w-[760px]">
      <h1 className="h-disp text-[30px] mt-0 mb-1">Rivals &amp; settings</h1>
      <p className="m-0 text-ink-soft text-[14px]">
        {brand.name} · <a className="underline" href="/app/setup?again=1">{brand.url}</a>
      </p>

      <h2 className="h-disp text-[20px] mt-10 mb-1">Rivals watched</h2>
      <p className="mt-0 mb-4 text-ink-soft text-[14px]">
        {rivals.length} of {MAX_RIVALS}. A new rival is read on the next scan.
      </p>
      <div className="card mb-4">
        <RivalList rivals={rivals} />
      </div>
      <div className="card">
        <AddRivalForm />
      </div>

      <h2 id="billing" className="h-disp text-[20px] mt-12 mb-3">
        Plan
      </h2>
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {plan.paid ? (
            <b>TRND · {PRICE_LABEL}</b>
          ) : plan.locked ? (
            <b>Trial ended</b>
          ) : (
            <b>
              Free trial · {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left
            </b>
          )}
          {brand.plan_status === "past_due" && <p className="m-0 text-red text-[14px]">Your last payment failed. Update your card to keep scans running.</p>}
          {billing === "success" && <p className="m-0 text-mint text-[14px]">Thanks. Your plan is active.</p>}
          {!isStripeConfigured && <p className="m-0 text-ink-faint text-[13px]">Billing isn&apos;t connected on this deployment.</p>}
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
    </div>
  );
}
