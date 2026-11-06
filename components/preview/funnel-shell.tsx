import Link from "next/link";

import Brand from "@/components/brand";

/** The four screens of the free read, named so a visitor can see where they are and how little is left. */
export const FUNNEL_STEPS = ["Your handle", "That's you", "Your goal", "What's wrong"] as const;

function Progress({ step }: { step: number }) {
  return (
    <div className="wrap">
      <ol className="list-none m-0 p-0 grid grid-cols-4 gap-2" aria-label={`Step ${step} of ${FUNNEL_STEPS.length}`}>
        {FUNNEL_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label} className="grid gap-1.5" aria-current={n === step ? "step" : undefined}>
              <span className={`h-1 rounded-full transition-colors duration-500 ${n <= step ? "bg-brand" : "bg-line"}`} />
              <span className={`text-[12px] max-sm:hidden ${n === step ? "text-ink font-semibold" : n < step ? "text-ink-2" : "text-ink-3"}`}>
                {n < step ? "✓ " : ""}
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The frame every funnel screen sits in: the named progress, the wordmark,
 * and one thing in the middle. `wide` is for the result, which needs the room.
 */
export default function FunnelShell({ step, wide = false, children }: { step: number; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="wrap flex items-center justify-between h-14">
        <Brand />
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign in
        </Link>
      </header>
      <Progress step={step} />
      <main className={`flex-1 ${wide ? "wrap pt-4 sm:pt-8 pb-[calc(8rem+env(safe-area-inset-bottom))]" : "grid items-center"}`}>{wide ? children : <div className="rise wrap py-8 sm:py-12">{children}</div>}</main>
    </div>
  );
}

/** "2 of 4", above each question. */
export function StepNo({ n }: { n: number }) {
  return (
    <div className="text-[13px] text-brand font-semibold tnum mb-3">
      {n} of {FUNNEL_STEPS.length} · {FUNNEL_STEPS[n - 1]}
    </div>
  );
}
