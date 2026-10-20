import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import { GoalsForm, HandleForm } from "@/components/app/forms";
import SubmitButton from "@/components/app/submit-button";
import { retryScanAction } from "@/lib/actions";
import { createCreator } from "@/lib/creators/create";
import { getSessionUser } from "@/lib/auth/session";
import { getCreator, listPlans } from "@/lib/data";
import type { ScanStage } from "@/lib/db/types";
import { isScanning } from "@/lib/format";
import { normHandle } from "@/lib/tiktok/read";

export const metadata = { title: "Set up — TRND for creators" };
// The first read runs after the handle form's response, inside this route's time limit.
export const maxDuration = 300;

const STEPS: { stages: ScanStage[]; label: string; done: string }[] = [
  { stages: ["profile"], label: "Reading your last 30 videos", done: "Your numbers and your niche" },
  { stages: ["niche", "peers"], label: "Finding creators ahead of you", done: "A step or two bigger, same niche" },
  { stages: ["trends"], label: "Scanning what's rising in your niche", done: "This week vs last" },
  { stages: ["tag", "plan"], label: "Writing your next 3 posts", done: "Ready" },
];

/** Three steps: the handle; the read, with the goal asked while it runs; then the plan. */
export default async function SetupPage({ searchParams }: PageProps<"/app/setup">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  const { handle: raw, again } = await searchParams;
  const typed = typeof raw === "string" ? normHandle(raw) : undefined;

  // Straight from sign-up with the handle they previewed: the account is made, and the preview claimed, here.
  if (!creator && typed && /^[a-z0-9_.]{2,24}$/.test(typed)) {
    const made = await createCreator(user.id, typed);
    redirect(made.claimed ? "/app/welcome" : "/app/setup");
  }

  if (!creator || again) {
    return (
      <section className="max-w-[640px] pt-6 sm:pt-14 grid gap-5">
        <span className="kicker">Step 1 of 3</span>
        <h1 className="display text-[clamp(28px,5vw,40px)]">What&apos;s your TikTok?</h1>
        <p className="text-ink-2 text-[16px] max-w-[56ch]">
          We read your public videos, find creators a step ahead of you and what&apos;s rising in your niche, then write your next three posts. Your account has to be public.
        </p>
        <HandleForm defaultHandle={typed ?? creator?.handle} />
      </section>
    );
  }

  const [latest] = await listPlans(creator.id, 1);
  const running = isScanning(creator);
  if (latest) redirect("/app/welcome");

  const failed = creator.scan_status === "error";
  // The read stopped without finishing (its function died, or it never started): offer to pick it up.
  const stalled = !running && !failed && !latest;
  const at = latest ? STEPS.length : Math.max(0, STEPS.findIndex((s) => creator.scan_stage && s.stages.includes(creator.scan_stage)));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start pt-2 sm:pt-6">
      {running && <AutoRefresh every={4000} />}
      <section className="grid gap-4">
        <span className="label">@{creator.handle}</span>
        <h1 className="heading text-[clamp(22px,3vw,28px)]">{latest ? "Your plan is ready" : failed ? "We hit a problem" : stalled ? "The read stopped" : "Building your plan"}</h1>
        {failed ? (
          <>
            <p className="text-neg text-[14.5px]">{creator.scan_error}</p>
            <HandleForm defaultHandle={creator.handle} cta="Try again" />
          </>
        ) : stalled ? (
          <>
            <p className="text-ink-2">It stopped before your plan was written. Nothing is lost: it picks up where it left off.</p>
            <form action={retryScanAction}>
              <SubmitButton className="btn btn-primary" pending="Starting…">
                Try again
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="text-ink-2">{latest ? "Everything is read." : "A few minutes. The plan opens once everything is ready, so nothing shifts while you read."}</p>
        )}
        <div className="h-1 rounded bg-muted overflow-hidden">
          <i className="block h-full bg-brand transition-[width] duration-500" style={{ width: `${Math.max(0, at) * 25}%` }} />
        </div>
        <ul className="list-none m-0 p-0 card overflow-hidden">
          {STEPS.map((s, i) => {
            const done = i < at;
            const now = i === at && running;
            return (
              <li key={s.label} className={`flex gap-3 items-center px-3.5 py-3 border-b border-line last:border-b-0 ${done || now ? "text-ink" : "text-ink-3"}`}>
                <span
                  className={`w-[18px] h-[18px] rounded-full grid place-items-center text-[11px] shrink-0 border-[1.5px] ${
                    done ? "bg-pos border-pos text-surface" : now ? "border-brand border-t-transparent animate-spin" : "border-line"
                  }`}
                >
                  {done ? "✓" : ""}
                </span>
                {s.label}
                <span className="ml-auto mono text-[12px] text-ink-2 text-right">{done ? s.done : ""}</span>
              </li>
            );
          })}
        </ul>
        <Link href="/app/setup?again=1" className="caption hover:text-ink">
          Wrong account? Use a different handle
        </Link>
      </section>

      <section className="card p-5 sm:p-6 grid gap-4">
        <div>
          <span className="kicker">{creator.goals ? "Your goal" : "While we read · 20 seconds"}</span>
          <h2 className="heading text-[clamp(18px,2.4vw,22px)] mt-1.5">What are you posting for? Every idea is judged against this.</h2>
        </div>
        <GoalsForm goals={creator.goals} next={latest ? "/app" : undefined} cta={latest ? "Show me what to post" : "Save"} />
        {latest && creator.goals && (
          <Link href="/app" className="btn btn-primary self-start">
            Show me what to post
          </Link>
        )}
      </section>
    </div>
  );
}
