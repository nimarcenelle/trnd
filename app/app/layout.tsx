import Link from "next/link";
import { redirect } from "next/navigation";

import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getBrand } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  const plan = brand ? planState(brand) : null;

  return (
    <div className="min-h-dvh flex flex-col">
      <nav className="rd-nav">
        <div className="flex items-center gap-6">
          <Brand href="/app" live />
          {brand && (
            <div className="hidden sm:flex gap-5 text-[14px] text-ink-soft">
              <Link href="/app">Dashboard</Link>
              <Link href="/app/settings">Rivals &amp; settings</Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <form action={signOutAction}>
            <button className="btn btn-ghost btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      {plan?.locked && (
        <div className="bg-amber/15 text-[14px] py-2.5 px-6">
          <b>Your trial has ended.</b> Scans are paused.{" "}
          <Link className="underline" href="/app/settings#billing">
            Choose a plan
          </Link>{" "}
          to switch the cameras back on.
        </div>
      )}
      {plan && !plan.locked && !plan.paid && plan.trialDaysLeft <= 5 && (
        <div className="bg-amber/15 text-[14px] py-2.5 px-6">
          Trial: {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left.{" "}
          <Link className="underline" href="/app/settings#billing">
            Choose a plan
          </Link>
        </div>
      )}
      <main className="wrap py-10 flex-1">{children}</main>
    </div>
  );
}
