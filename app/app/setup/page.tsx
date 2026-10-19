import Link from "next/link";
import { redirect } from "next/navigation";

import AutoRefresh from "@/components/app/auto-refresh";
import { GoalsForm, HandleForm } from "@/components/app/forms";
import { getSessionUser } from "@/lib/auth/session";
import { getCreator, listPlans } from "@/lib/data";
import type { ScanStage } from "@/lib/db/types";
import { isScanning } from "@/lib/format";
import { normHandle } from "@/lib/tiktok/read";

export const metadata = { title: "Set up — TRND for creators" };

const STEPS: { stage: ScanStage; label: string; done: string }[] = [
  { stage: "profile", label: "Reading your last 30 videos", done: "Your numbers and your niche" },
  { stage: "peers", label: "Finding creators like you", done: "Matched by niche hashtags and size" },
  { stage: "trends", label: "Scanning what's rising in your niche", done: "Hashtags and sounds, this week vs last" },
  { stage: "plan", label: "Writing your next 3 posts", done: "Ready" },
];

/** Three steps: the handle; the read, with the goal asked while it runs; then the plan. */
export default async function SetupPage({ searchParams }: PageProps<"/app/setup">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  const { handle: raw, again } = await searchParams;
  const typed = typeof raw === "string" ? normHandle(raw) : undefined;

  if (!creator || again) {
    return (
      <section className="max-w-[640px] pt-6 sm:pt-14 grid gap-5">
        <span className="kicker">Step 1 of 3</span>
        <h1 className="display text-[clamp(28px,5vw,40px)]">What&apos;s your TikTok?</h1>
        <p className="text-ink-2 text-[16px] max-w-[56ch]">
          We read your public videos, find creators like you and what&apos;s rising in your niche, then write your next three posts. Your account has to be public.
        </p>
        <HandleForm defaultHandle={typed ?? creator?.handle} />
      </section>
    );
  }

  const [latest] = await listPlans(creator.id, 1);
  const running = isScanning(creator) || (creator.scan_status === "running" && Boolean(creator.scan_stage));
  if (latest && creator.goals) redirect("/app");

  const at = running ? STEPS.findIndex((s) => s.stage === creator.scan_stage) : latest ? STEPS.length : -1;
  const failed = creator.scan_status === "error";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start pt-2 sm:pt-6">
      {running && <AutoRefresh every={4000} />}
      <section className="grid gap-4">
        <span className="label">@{creator.handle}</span>
        <h1 className="heading text-[clamp(22px,3vw,28px)]">{latest ? "Your plan is ready" : failed ? "We hit a problem" : "Building your plan"}</h1>
        {failed ? (
          <>
            <p className="text-neg text-[14.5px]">{creator.scan_error}</p>
            <HandleForm defaultHandle={creator.handle} cta="Try again" />
          </>
        ) : (
          <p className="text-ink-2">{latest ? "Everything is read." : "About two minutes. The plan opens once everything is ready, so nothing shifts while you read."}</p>
        )}
        <div className="h-1 rounded bg-muted overflow-hidden">
          <i className="block h-full bg-brand transition-[width] duration-500" style={{ width: `${Math.max(0, at) * 25}%` }} />
        </div>
        <ul className="list-none m-0 p-0 card overflow-hidden">
          {STEPS.map((s, i) => {
            const done = i < at;
            const now = i === at && running;
            return (
              <li key={s.stage} className={`flex gap-3 items-center px-3.5 py-3 border-b border-line last:border-b-0 ${done || now ? "text-ink" : "text-ink-3"}`}>
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
