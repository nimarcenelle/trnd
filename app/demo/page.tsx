import { cookies } from "next/headers";

import DemoPanel from "@/components/essayodds/demo-panel";
import SiteNav from "@/components/site-nav";
import { DEMO_COOKIE } from "@/lib/essayodds/demo";

export const metadata = { title: "Demo · EssayOdds", robots: { index: false, follow: false } };

/** The recording setup: turn demo mode on, then open a scene. Not linked from the site. */
export default async function DemoPage() {
  const on = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteNav links={false} />
      <main className="flex-1 bg-subtle">
        <div className="wrap py-12 sm:py-16 max-w-[760px]">
          <p className="kicker">For recording</p>
          <h1 className="section-title text-[32px] sm:text-[40px] mt-2">Demo mode</h1>
          <p className="text-[15px] text-ink-2 leading-[1.65] mt-3">
            Unlocks the paid tools in this browser for a sample student whose results are already saved, so every screen answers instantly. Anything else still asks for a plan. Nothing is saved to an account while it&apos;s on. It switches off by itself after 12 hours.
          </p>
          <div className="card p-5 mt-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold">{on ? "Demo mode is on" : "Demo mode is off"}</p>
              <p className="text-[13px] text-ink-2 mt-0.5">{on ? "Record in this browser. Use a clean window: hide bookmarks and extensions." : "Turn it on, then open a scene."}</p>
            </div>
            <a className={`btn ${on ? "btn-secondary" : "btn-primary"}`} href={on ? "/demo/stop" : "/demo/start"}>
              {on ? "Turn off" : "Turn on"}
            </a>
          </div>
          {on && (
            <>
              <div className="mt-8 flex items-center justify-between gap-4">
                <h2 className="text-[16px] font-semibold">Scenes</h2>
                <a className="text-[13px] underline text-ink-2 hover:text-ink" href="/demo/sample-common-app.pdf" download>
                  Download the sample Common App PDF
                </a>
              </div>
              <div className="mt-3">
                <DemoPanel />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
