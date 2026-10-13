import Link from "next/link";
import { redirect } from "next/navigation";

import Avatar from "@/components/app/avatar";
import { SideNav, TopTabs, type RivalLink } from "@/components/app/side-nav";
import Brand from "@/components/brand";
import ThemeToggle from "@/components/theme-toggle";
import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth/session";
import { planState } from "@/lib/billing";
import { getBrand, listAds, listRivals } from "@/lib/data";
import { ago, isScanning } from "@/lib/format";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  const plan = brand ? planState(brand) : null;
  const [rivals, live] = brand ? await Promise.all([listRivals(brand.id), listAds(brand.id, { activeOnly: true })]) : [[], []];
  const scanning = brand ? isScanning(brand) : false;
  const links: RivalLink[] = rivals.map((r) => ({
    id: r.id,
    name: r.name,
    live: live.filter((a) => a.rival_id === r.id).length,
    error: Boolean(r.last_error),
  }));
  const setup = !brand || (!brand.last_scan_at && !scanning);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col sticky top-0 h-dvh border-r border-line bg-subtle px-3 py-4">
        <div className="px-2.5 h-8 flex items-center">
          <Brand href="/app" />
        </div>
        {brand && (
          <div className="mt-5 flex items-center gap-2.5 px-2.5">
            <Avatar name={brand.name} size={28} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold truncate">{brand.name}</div>
              <div className="text-[12px] text-ink-3 truncate">{brand.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
            </div>
          </div>
        )}
        <div className="mt-6 min-h-0 overflow-y-auto">
          <SideNav rivals={links} setup={setup} />
        </div>
        <div className="mt-auto pt-4 border-t border-line flex flex-col gap-3">
          {brand && (
            <div className="px-2.5 flex items-center gap-2 text-[12px] text-ink-2">
              {scanning ? <span className="spinner !w-3 !h-3" /> : <span className={brand.last_scan_at ? "live-dot !w-1.5 !h-1.5" : "w-1.5 h-1.5 rounded-full bg-line-strong"} />}
              {scanning ? "Scanning now" : brand.last_scan_at ? `Watching · scanned ${ago(brand.last_scan_at)}` : "Not watching yet"}
            </div>
          )}
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] text-ink-3 truncate px-1.5">{user.email}</span>
            <div className="flex items-center">
              <ThemeToggle />
              <form action={signOutAction}>
                <button className="btn btn-ghost btn-sm" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="flex items-center justify-between px-4 h-12">
            <Brand href="/app" />
            <div className="flex items-center">
              <ThemeToggle />
              <form action={signOutAction}>
                <button className="btn btn-ghost btn-sm" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {!setup && <TopTabs rivals={links} />}
        </header>

        {plan?.locked && (
          <div className="border-b border-line bg-neg-bg text-neg text-[13px] py-2 px-5 sm:px-8 lg:px-10">
            Your trial has ended and scans are paused.{" "}
            <Link className="underline font-medium" href="/app/settings#billing">
              Choose a plan
            </Link>
          </div>
        )}
        {plan && !plan.locked && !plan.paid && plan.trialDaysLeft <= 5 && (
          <div className="border-b border-line bg-warn-bg text-warn text-[13px] py-2 px-5 sm:px-8 lg:px-10">
            {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left in your trial.{" "}
            <Link className="underline font-medium" href="/app/settings#billing">
              Choose a plan
            </Link>
          </div>
        )}
        <main className="flex-1 w-full max-w-[1200px] px-5 sm:px-8 lg:px-10 py-7 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
