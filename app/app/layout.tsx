import Link from "next/link";
import { redirect } from "next/navigation";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getCreator } from "@/lib/data";

/** The app's top rail: the wordmark, the creator, settings, theme and sign out. One column below it. */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const creator = await getCreator(user.id);
  const plan = creator ? planState(creator) : null;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="wrap flex items-center gap-3 h-14">
          <Brand href="/app" />
          <div className="flex-1" />
          {creator && (
            <Link href="/app/settings" className="btn btn-ghost btn-sm max-[480px]:hidden">
              Settings
            </Link>
          )}
          <ThemeToggle />
          <form action={signOutAction}>
            <button className="btn btn-ghost btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {plan?.locked && (
        <div className="border-b border-line bg-neg-bg text-neg text-[13.5px] py-2">
          <div className="wrap">
            Your trial has ended and daily reads are paused.{" "}
            <Link className="underline font-semibold" href="/app/settings#billing">
              Choose a plan
            </Link>
          </div>
        </div>
      )}
      {plan && !plan.locked && !plan.paid && plan.trialDaysLeft <= 3 && (
        <div className="border-b border-line bg-warn-bg text-warn text-[13.5px] py-2">
          <div className="wrap">
            {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left in your trial.{" "}
            <Link className="underline font-semibold" href="/app/settings#billing">
              Choose a plan
            </Link>
          </div>
        </div>
      )}
      <main className="wrap flex-1 py-6 sm:py-8 pb-16">{children}</main>
    </div>
  );
}
