import Link from "next/link";
import { redirect } from "next/navigation";

import { ModelsForm } from "@/components/app/forms";
import SubmitButton from "@/components/app/submit-button";
import { checkoutAction, welcomeAnswerAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { cardFirst, planState, PRICES, TRIAL_DAYS } from "@/lib/billing";
import { getCreator, listPeers, listPlans } from "@/lib/data";
import { isStripeConfigured } from "@/lib/env";
import { dateIn } from "@/lib/format";
import { GOALS } from "@/lib/goals";

export const metadata = { title: "Welcome — TRND for creators" };

const CADENCE = [
  { value: "1-2", label: "1–2 a week" },
  { value: "3-4", label: "3–4 a week" },
  { value: "5+", label: "5 or more" },
];
const CAMERA = [
  { value: "face", label: "On camera", hint: "My face is in my videos" },
  { value: "voice", label: "Voiceover", hint: "Hands, screen or b-roll, my voice" },
  { value: "either", label: "Either", hint: "I do both" },
];

function Progress({ n, of }: { n: number; of: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="kicker">
        Step {n} of {of}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: of }, (_, i) => (
          <i key={i} className={`block h-1 w-7 rounded-full ${i < n ? "bg-brand" : "bg-line-strong"}`} />
        ))}
      </span>
    </div>
  );
}

function Choice({ field, value, next, selected, label, hint }: { field: string; value: string; next: string; selected: boolean; label: string; hint?: string }) {
  return (
    <form action={welcomeAnswerAction}>
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" className={`choice w-full text-left !py-3.5 ${selected ? "!border-brand !bg-brand-soft" : ""}`} aria-pressed={selected}>
        <span className="block font-bold text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] text-ink-2">{hint}</span>}
      </button>
    </form>
  );
}

/**
 * After sign-up: two one-tap questions that shape every script, the creators
 * they want to be like, then the trial. Each step is skippable; the plan is
 * already there.
 */
export default async function WelcomePage({ searchParams }: PageProps<"/app/welcome">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  if (!creator) redirect("/app/setup");
  const [latest] = await listPlans(creator.id, 1);
  if (!latest) redirect("/app/setup");
  const { step: raw } = await searchParams;
  const plan = planState(creator);
  // Locked with billing on: the last step is choosing a plan (with the trial when card-first, straight to paying after a no-card trial).
  const needsTrial = isStripeConfigured && plan.locked;
  // No-card trial: a plan can be picked any time during it (it starts charging when the trial ends), just never as a step they must take.
  const canChoose = needsTrial || (isStripeConfigured && !cardFirst && plan.trialing);
  const of = needsTrial ? 4 : 3;
  const step = raw === "camera" || raw === "models" || raw === "trial" ? raw : creator.goals ? (creator.on_camera ? (needsTrial ? "trial" : "done") : "camera") : "goal";
  if (step === "done" || (step === "trial" && !canChoose)) redirect("/app");

  const after = needsTrial ? "trial" : "done";

  if (step === "models") {
    const mine = (await listPeers(creator.id)).filter((p) => p.source === "owner").map((p) => p.handle);
    return (
      <section className="max-w-[620px] mx-auto pt-4 sm:pt-12 grid gap-6">
        <Progress n={3} of={of} />
        <div>
          <h1 className="display text-[clamp(26px,4.5vw,36px)]">Who do you want to be like?</h1>
          <p className="text-ink-2 mt-2">
            Up to three creators a step or two ahead of you. We read their videos every day and build your ideas from what got them there, not from
            accounts your size.
          </p>
        </div>
        <ModelsForm next={after} defaults={mine} />
        <Link href={after === "trial" ? "/app/welcome?step=trial" : "/app"} className="btn btn-ghost btn-sm self-start">
          Skip, pick for me
        </Link>
      </section>
    );
  }

  if (step === "goal" || step === "camera") {
    return (
      <section className="max-w-[620px] mx-auto pt-4 sm:pt-12 grid gap-6">
        <Progress n={step === "goal" ? 1 : 2} of={of} />
        {step === "goal" ? (
          <>
            <div>
              <h1 className="display text-[clamp(26px,4.5vw,36px)]">What are you posting for?</h1>
              <p className="text-ink-2 mt-2">Your ideas are ranked for it.</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {GOALS.map((g) => (
                <Choice key={g.value} field="goal" value={g.value} next="camera" selected={creator.goals?.goal === g.value} label={g.label} hint={g.hint} />
              ))}
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="display text-[clamp(26px,4.5vw,36px)]">How do you film?</h1>
              <p className="text-ink-2 mt-2">Scripts are written for how you make videos, and how often.</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {CAMERA.map((c) => (
                <Choice key={c.value} field="camera" value={c.value} next="camera" selected={creator.on_camera === c.value} label={c.label} hint={c.hint} />
              ))}
            </div>
            <div className="grid gap-2.5">
              <div className="text-[14px] font-semibold">How often can you post?</div>
              <div className="grid gap-2.5 grid-cols-3">
                {CADENCE.map((c) => (
                  <Choice key={c.value} field="cadence" value={c.value} next="camera" selected={creator.goals?.posts_per_week === c.value} label={c.label} />
                ))}
              </div>
            </div>
            <Link href="/app/welcome?step=models" className={`btn btn-lg self-start ${creator.on_camera ? "btn-primary" : ""}`}>
              {creator.on_camera ? "Continue" : "Skip for now"}
            </Link>
          </>
        )}
      </section>
    );
  }

  // The trial: what happens when, both prices, monthly first.
  const charge = dateIn(TRIAL_DAYS);
  const remind = dateIn(TRIAL_DAYS - 2);
  return (
    <section className="max-w-[720px] mx-auto pt-4 sm:pt-10 grid gap-6">
      <Progress n={4} of={4} />
      <div>
        <h1 className="display text-[clamp(26px,4.5vw,38px)]">{plan.canTrial ? `Your plan is ready. Try it free for ${TRIAL_DAYS} days.` : plan.trialing ? "Keep it going after your trial" : "Pick up where you left off"}</h1>
        <p className="text-ink-2 mt-2">
          {plan.trialing && !cardFirst
            ? `Your free trial runs ${plan.trialDaysLeft} more day${plan.trialDaysLeft === 1 ? "" : "s"}. Pick a plan now and the first charge waits until it ends.`
            : "All three scripts this week, a new plan every week, and every idea checked after you post it."}
        </p>
      </div>
      {plan.canTrial && (
        <ol className="list-none m-0 p-0 card divide-y divide-line">
          {[
            ["Today", "All three scripts unlock. You're not charged today."],
            [remind, "We email you a reminder, two days before the trial ends."],
            [charge, "Your plan starts. Cancel any time before, in two clicks."],
          ].map(([when, what], i) => (
            <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-3.5 items-baseline">
              <span className={`mono text-[12.5px] ${i === 0 ? "text-brand font-medium" : "text-ink-2"}`}>{when}</span>
              <span className="text-[15px]">{what}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["monthly", "weekly"] as const).map((i) => (
          <form key={i} action={checkoutAction} className={`card p-5 grid gap-3 content-start ${i === "monthly" ? "!border-brand shadow-[inset_0_0_0_1px_var(--brand)]" : ""}`}>
            <input type="hidden" name="interval" value={i} />
            <div className="flex items-center justify-between">
              <span className="font-bold">{i === "monthly" ? "Monthly" : "Weekly"}</span>
              {i === "monthly" && <span className="pill pill-brand">Best value</span>}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="display text-[34px]">{PRICES[i].perWeek}</span>
              <span className="text-ink-2">/ week</span>
            </div>
            <span className="caption">{i === "monthly" ? "$24.99 billed monthly · 42% less than weekly" : "$9.99 billed weekly"}</span>
            <SubmitButton className={i === "monthly" ? "btn btn-primary btn-lg w-full" : "btn btn-lg w-full"} pending="Opening checkout…">
              {plan.canTrial ? "Start my free trial" : plan.trialing ? `Choose ${i}` : `Subscribe ${i}`}
            </SubmitButton>
          </form>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="caption">Secure checkout by Stripe. Cancel any time from Settings.</span>
        <Link href="/app" className="btn btn-ghost btn-sm">
          Not now
        </Link>
      </div>
    </section>
  );
}
