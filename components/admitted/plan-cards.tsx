import Link from "next/link";

import { IconCheck } from "@/components/icons";
import { FREE_FEATURES, PAID_FEATURES, PLANS, type Plan } from "@/lib/admitted/plans";

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="list-none p-0 m-0 mt-6 mb-8 flex flex-col gap-3">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5 text-[14px]">
          <IconCheck className="text-brand mt-[3px] shrink-0" />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Agree() {
  return (
    <p className="caption text-center mt-3">
      By paying you agree to the{" "}
      <Link className="underline hover:text-ink" href="/terms">
        Terms
      </Link>{" "}
      and{" "}
      <Link className="underline hover:text-ink" href="/privacy">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

/** One plan's buy button. `forStudent` sends a parent to a page with the link to pass on. */
export function BuyButton({ plan, primary, forStudent = false, label }: { plan: Plan; primary: boolean; forStudent?: boolean; label?: string }) {
  return (
    <form action="/api/essays/checkout" method="post" className="mt-auto">
      <input type="hidden" name="plan" value={plan.id} />
      {forStudent && <input type="hidden" name="for" value="student" />}
      <button className={`btn btn-lg w-full ${primary ? "btn-primary" : "btn-secondary"}`} type="submit">
        {label ?? (plan.id === "season" ? "Get the season pass" : "Start monthly")}
      </button>
    </form>
  );
}

function PaidCard({ plan, best, forStudent }: { plan: Plan; best: boolean; forStudent: boolean }) {
  return (
    <div className={`card p-8 flex flex-col ${best ? "shadow-[var(--shadow-lg)] border-line-strong" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[14px] font-semibold ${best ? "text-[var(--kicker)]" : "text-ink-2"}`}>{plan.name}</div>
        {best && <span className="badge badge-info">Best value</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[40px] font-semibold tnum">{plan.price}</span>
        <span className="text-[14px] text-ink-3">{plan.per}</span>
      </div>
      <p className="text-[13px] text-ink-2 mt-1">{plan.billed}</p>
      <Checks items={PAID_FEATURES} />
      <BuyButton plan={plan} primary={best} forStudent={forStudent} />
    </div>
  );
}

/** Free, monthly and season pass side by side. `forStudent` is the parent-pays page: no free card. */
export default function PlanCards({ forStudent = false }: { forStudent?: boolean }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 items-stretch ${forStudent ? "md:grid-cols-2 max-w-[760px]" : "md:grid-cols-3 max-w-[1080px]"} mx-auto`}>
      {!forStudent && (
        <div className="card p-8 flex flex-col">
          <div className="text-[14px] font-semibold text-ink-2">Free</div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-[40px] font-semibold tnum">$0</span>
          </div>
          <p className="text-[13px] text-ink-2 mt-1">No card, no account.</p>
          <Checks items={FREE_FEATURES} />
          <Link href="/essay" className="btn btn-secondary btn-lg w-full mt-auto">
            Review my essay free
          </Link>
        </div>
      )}
      <PaidCard plan={PLANS.monthly} best={false} forStudent={forStudent} />
      <PaidCard plan={PLANS.season} best forStudent={forStudent} />
    </div>
  );
}
