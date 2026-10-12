import Link from "next/link";
import { redirect } from "next/navigation";

import { SideLinks, TopTabs, type NavItem } from "@/components/app/side-nav";
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

  const main: NavItem[] = brand
    ? [
        { href: "/app", label: "Briefing" },
        { href: "/app/settings", label: "Rivals & settings" },
      ]
    : [{ href: "/app/setup", label: "Setup" }];
  const rivalLinks: NavItem[] = rivals.map((r) => ({
    href: `/app/rivals/${r.id}`,
    label: r.name,
    meta: String(live.filter((a) => a.rival_id === r.id).length),
    alert: Boolean(r.last_error),
  }));

  const status = brand && (
    <div className="flex items-center gap-2 label !text-[10px]">
      <i className={`dot ${scanning ? "dot-rec" : "pulse"}`} />
      {scanning ? "Scanning now" : brand.last_scan_at ? `Watching · ${ago(brand.last_scan_at)}` : "Not watching yet"}
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col sticky top-0 h-dvh border-r border-line bg-bg-1/60 px-3 py-5">
        <div className="px-2.5">
          <Brand href="/app" live />
        </div>
        {brand && (
          <div className="mt-7 mx-1 inset px-3 py-2.5">
            <div className="label !text-[10px]">Watching for</div>
            <div className="font-semibold truncate mt-0.5">{brand.name}</div>
            <div className="text-[12px] text-ink-3 truncate">{brand.url.replace(/^https?:\/\//, "")}</div>
          </div>
        )}
        <div className="mt-6">
          <SideLinks items={main} />
        </div>
        {rivalLinks.length > 0 && (
          <div className="mt-7 min-h-0 flex flex-col">
            <div className="flex justify-between px-2.5 mb-2 label !text-[10px]">
              <span>Rivals</span>
              <span>Live ads</span>
            </div>
            <div className="overflow-y-auto">
              <SideLinks items={rivalLinks} />
            </div>
          </div>
        )}
        <div className="mt-auto pt-6 px-2.5 flex flex-col gap-4">
          {status}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-3 truncate">{user.email}</span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={signOutAction}>
                <button className="btn btn-quiet btn-sm" type="submit" title="Sign out">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 h-14">
            <Brand href="/app" live />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={signOutAction}>
                <button className="btn btn-quiet btn-sm" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {brand && <TopTabs items={[...main, ...rivalLinks]} />}
        </header>

        {plan?.locked && (
          <div className="border-b border-line bg-rec/10 text-[14px] py-2.5 px-5 sm:px-8 lg:px-12">
            <b>Your trial has ended.</b> Scans are paused.{" "}
            <Link className="underline text-ink" href="/app/settings#billing">
              Choose a plan
            </Link>{" "}
            to switch the cameras back on.
          </div>
        )}
        {plan && !plan.locked && !plan.paid && plan.trialDaysLeft <= 5 && (
          <div className="border-b border-line bg-amber/10 text-[14px] py-2.5 px-5 sm:px-8 lg:px-12">
            Trial: {plan.trialDaysLeft} day{plan.trialDaysLeft === 1 ? "" : "s"} left.{" "}
            <Link className="underline" href="/app/settings#billing">
              Choose a plan
            </Link>
          </div>
        )}
        <main className="flex-1 w-full max-w-[1240px] px-5 sm:px-8 lg:px-12 py-8 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
