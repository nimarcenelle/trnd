import { redirect } from "next/navigation";

import { AddRivalForm, UrlForm } from "@/components/app/forms";
import RivalList from "@/components/app/rival-list";
import SubmitButton from "@/components/app/submit-button";
import { scanNowAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { getBrand, listRivals } from "@/lib/data";
import { isScanning } from "@/lib/format";

export const metadata = { title: "Set up — TRND" };
// Reading the site and naming rivals is one model call; the first scan runs after the response.
export const maxDuration = 300;

function Step({ n }: { n: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3">
      <span className="caption">Step {n} of 2</span>
      <div className="flex gap-1">
        <span className="w-6 h-1 rounded-full bg-ink" />
        <span className={`w-6 h-1 rounded-full ${n === 2 ? "bg-ink" : "bg-line-strong"}`} />
      </div>
    </div>
  );
}

/** Two steps: the site, then the competitors to confirm before the first scan. */
export default async function SetupPage({ searchParams }: PageProps<"/app/setup">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  const { url, again } = await searchParams;

  if (!brand || again) {
    return (
      <div className="max-w-[520px] mx-auto pt-6 sm:pt-16">
        <Step n={1} />
        <h1 className="heading text-[26px] mt-5">What&apos;s your website?</h1>
        <p className="text-[15px] text-ink-2 mt-2 mb-7 leading-[1.6]">
          We&apos;ll read it to understand what you sell, then find the competitors running Meta ads to the same customers.
        </p>
        <UrlForm defaultUrl={typeof url === "string" ? url : brand?.url} />
      </div>
    );
  }
  if (brand.last_scan_at || isScanning(brand)) redirect("/app");

  const rivals = await listRivals(brand.id);
  return (
    <div className="max-w-[680px] mx-auto pt-6 sm:pt-12">
      <Step n={2} />
      <h1 className="heading text-[26px] mt-5">Confirm your competitors</h1>
      <p className="text-[15px] text-ink-2 mt-2 leading-[1.6]">
        We found {rivals.length} brands competing with {brand.name}, most direct first. Remove any that aren&apos;t a fit and add any we
        missed. A brand that turns out to run no Meta ads is swapped for the next closest one during the first read.
      </p>
      {brand.summary && (
        <div className="well px-4 py-3 mt-5 text-[13px] text-ink-2 leading-[1.6]">
          <span className="font-medium text-ink">{brand.name}: </span>
          {brand.summary}
        </div>
      )}

      <div className="card mt-5">
        <RivalList rivals={rivals} />
        <div className="border-t border-line p-4 bg-subtle rounded-b-xl">
          <AddRivalForm />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <a className="text-[13px] text-ink-3 hover:text-ink" href="/app/setup?again=1">
          Use a different website
        </a>
        <form action={scanNowAction}>
          <SubmitButton className="btn btn-primary btn-lg" pending="Starting…">
            Start tracking {rivals.length} competitors
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
