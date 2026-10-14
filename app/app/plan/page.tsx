import { redirect } from "next/navigation";

import PlanCard from "@/components/billing/plan-card";
import SubmitButton from "@/components/app/submit-button";
import { checkoutAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { AGENCY, planState, PLANS, stripePriceFor, TRIAL_DAYS, type Tier } from "@/lib/billing";
import { getBrand, listRivals } from "@/lib/data";
import { isStripeConfigured } from "@/lib/env";

export const metadata = { title: "Choose a plan — TRND" };

/** The day a trial started now would first charge the card. */
const chargeDate = () => new Date(Date.now() + TRIAL_DAYS * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** Picked once, before the first scan; the trial runs in Stripe with a card on file. */
export default async function PlanPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  if (!brand) redirect("/app/setup");
  const plan = planState(brand);
  // A failed payment is fixed in the billing portal, not with a second subscription.
  if (!isStripeConfigured || plan.paid || brand.plan_status === "past_due") redirect("/app/settings#billing");
  const rivals = await listRivals(brand.id);
  const trial = plan.needsPlan;
  const chargeOn = chargeDate();
  const tiers = (["starter", "growth"] as Tier[]).filter((t) => stripePriceFor(t));

  const note = (t: Tier) => {
    const limit = PLANS[t].rivals;
    if (rivals.length <= limit) return null;
    const first = rivals.slice(0, limit).map((r) => r.name);
    return `Watches the first ${limit} on your list: ${first.join(", ")}. The other ${rivals.length - limit} wait until you move to Growth.`;
  };

  return (
    <div className="max-w-[860px] mx-auto pt-6 sm:pt-12">
      {trial && (
        <div className="flex items-center gap-3">
          <span className="caption">Step 3 of 3</span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-6 h-1 rounded-full bg-ink" />
            ))}
          </div>
        </div>
      )}
      <h1 className="heading text-[26px] mt-5">{trial ? "Choose a plan to start tracking" : "Choose a plan"}</h1>
      <p className="text-[15px] text-ink-2 mt-2 leading-[1.6] max-w-[620px]">
        {trial
          ? `${TRIAL_DAYS} days free on either plan. Your card is charged on ${chargeOn}; cancel before then from Settings and you pay nothing.`
          : plan.locked
            ? `${brand.plan === "trial" ? "Your trial has ended" : "Your subscription has ended"} and scans are paused. Everything TRND found so far stays here.`
            : `${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left in your trial. Pick a plan to keep scans running after it ends.`}
      </p>

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 mt-8 ${tiers.length > 1 ? "sm:grid-cols-2" : "max-w-[440px]"}`}>
        {tiers.map((t) => {
          const p = PLANS[t];
          return (
            <PlanCard
              key={t}
              name={p.name}
              price={`$${p.price}`}
              blurb={p.blurb}
              features={p.features}
              featured={t === "growth" && tiers.length > 1}
              note={note(t)}
              cta={
                <form action={checkoutAction}>
                  <input type="hidden" name="tier" value={t} />
                  <input type="hidden" name="from" value={trial ? "setup" : "settings"} />
                  <SubmitButton className={`btn ${t === "growth" ? "btn-primary" : "btn-secondary"} btn-lg w-full`} pending="Opening Stripe…">
                    {trial ? `Start ${TRIAL_DAYS}-day trial` : `Subscribe to ${p.name}`}
                  </SubmitButton>
                </form>
              }
            />
          );
        })}
      </div>

      <p className="text-[13.5px] text-ink-2 mt-6">
        Running ads for several brands?{" "}
        <a className="text-ink underline" href={AGENCY.contact}>
          Ask about {AGENCY.name.toLowerCase()} pricing
        </a>
        .
      </p>
    </div>
  );
}
