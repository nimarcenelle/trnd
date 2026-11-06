"use client";

import { useActionState, useState } from "react";

import SubmitButton from "@/components/app/submit-button";
import { joinWaitlistAction, type WaitlistState } from "@/lib/actions";
import { type Addon, ADDONS, FREE, money, type Period, type Tier, TIER_ORDER, TIERS, yearlyPerMonth, yearlyVsMonthly } from "@/lib/billing";

/**
 * The four tiers, yearly by default (yearly billing is the main churn control),
 * Creator emphasized. Pro and Business aren't sold until their features ship:
 * their button takes a waitlist email. The add-ons follow as a plain row.
 *
 * `checkout` is a form action that takes `period` and `from` (the signed-in
 * upgrade step). Without it (the landing page) the buttons start with the handle.
 */

const Check = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-brand mt-[3px] shrink-0">
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

function Features({ items }: { items: string[] }) {
  return (
    <ul className="list-none p-0 m-0 grid gap-2 text-[14px]">
      {items.map((f) => (
        <li key={f} className="flex gap-2">
          <Check />
          {f}
        </li>
      ))}
    </ul>
  );
}

function Waitlist({ tier }: { tier: Tier }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {});
  if (state.joined) return <p className="text-[13.5px] text-pos m-0">You&apos;re on the list. We&apos;ll email you when {TIERS[tier].name} opens.</p>;
  if (!open)
    return (
      <button type="button" className="btn w-full" onClick={() => setOpen(true)}>
        Join the waitlist
      </button>
    );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="tier" value={tier} />
      <input name="email" type="email" required className="input !h-10 !rounded-full" placeholder="you@example.com" aria-label="Your email" autoComplete="email" />
      <SubmitButton className="btn w-full" pending="Saving…">
        Tell me when it opens
      </SubmitButton>
      {state.error && <p className="form-error m-0">{state.error}</p>}
    </form>
  );
}

export default function Pricing({
  checkout,
  start = "#start",
  current,
  soon = false,
}: {
  checkout?: (formData: FormData) => void | Promise<void>;
  /** Signed in, but checkout isn't open yet (the new prices aren't set): the button says so instead of failing. */
  soon?: boolean;
  /** Where the landing page's buttons go: the handle box. */
  start?: string;
  /** The signed-in account's tier, to mark its card. */
  current?: "free" | Tier;
}) {
  const [period, setPeriod] = useState<Period>("year");
  const price = (t: Tier) => (period === "year" ? TIERS[t].year : TIERS[t].month);

  return (
    <div className="grid gap-6">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-line bg-muted p-1 text-[14px] font-semibold">
          {(["year", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`h-9 px-4 rounded-full transition-colors ${period === p ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink"}`}
            >
              {p === "year" ? (
                <>
                  Yearly <span className="text-brand">· about a third off</span>
                </>
              ) : (
                "Monthly"
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        <div className="card p-5 grid gap-4 content-start">
          <div>
            <div className="font-bold text-[16px]">{FREE.name}</div>
            <p className="text-[13.5px] text-ink-2 mt-1 m-0">{FREE.blurb}</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="display text-[34px] tnum">$0</span>
            <span className="text-ink-2 text-[14px]">no card</span>
          </div>
          {checkout || soon ? (
            <span className="btn w-full pointer-events-none opacity-70">{current === "free" ? "Your plan" : "Included"}</span>
          ) : (
            <a href={start} className="btn w-full">
              Plan my next post
            </a>
          )}
          <Features items={FREE.features} />
        </div>

        {TIER_ORDER.map((t) => {
          const info = TIERS[t];
          const main = t === "creator";
          return (
            <div key={t} className={`card p-5 grid gap-4 content-start relative ${main ? "!border-brand shadow-[inset_0_0_0_1px_var(--brand)]" : ""}`}>
              {main && <span className="pill pill-brand absolute -top-3 left-5">Recommended</span>}
              <div>
                <div className="font-bold text-[16px] flex items-center gap-2">
                  {info.name}
                  {!info.available && <span className="pill">Coming soon</span>}
                </div>
                <p className="text-[13.5px] text-ink-2 mt-1 m-0">{info.blurb}</p>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="display text-[34px] tnum">{money(price(t))}</span>
                  <span className="text-ink-2 text-[14px]">/{period === "year" ? "year" : "month"}</span>
                </div>
                <div className="caption mt-1 min-h-[18px]">{period === "year" ? `${yearlyPerMonth(t)}/mo · ${yearlyVsMonthly(t)}` : `or ${money(info.year)}/year`}</div>
              </div>
              {info.available ? (
                checkout || soon ? (
                  soon ? (
                    <span className="btn w-full pointer-events-none opacity-70">Opening soon</span>
                  ) : current === t ? (
                    <span className="btn w-full pointer-events-none opacity-70">Your plan</span>
                  ) : (
                    <form action={checkout!}>
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="from" value="pricing" />
                      <SubmitButton className={`btn w-full ${main ? "btn-primary" : ""}`} pending="Opening checkout…">
                        Get {info.name} {period === "year" ? "yearly" : "monthly"}
                      </SubmitButton>
                    </form>
                  )
                ) : (
                  <a href={start} className={`btn w-full ${main ? "btn-primary" : ""}`}>
                    Plan my next 3 posts
                  </a>
                )
              ) : (
                <Waitlist tier={t} />
              )}
              <Features items={info.features} />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[14px] text-ink-2 border-t border-line pt-4">
        <span className="font-semibold text-ink">One-time add-ons</span>
        {(Object.keys(ADDONS) as Addon[]).map((a) => (
          <span key={a}>
            <span className="text-ink font-medium">{ADDONS[a].name}</span> · {money(ADDONS[a].price)} · {ADDONS[a].blurb}
          </span>
        ))}
        <a href={checkout || soon ? "/app/settings#add-ons" : start} className="text-brand font-medium">
          {checkout || soon ? "Buy an add-on" : "Start with your handle"}
        </a>
      </div>
      <p className="caption text-center m-0">Cancel anytime. Refund within 14 days if it isn&apos;t for you.</p>
    </div>
  );
}
