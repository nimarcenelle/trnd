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

/** Two steps: the site, then the rivals to confirm before the first scan. */
export default async function SetupPage({ searchParams }: PageProps<"/app/setup">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  const { url, again } = await searchParams;

  if (!brand || again) {
    return (
      <div className="max-w-[640px]">
        <span className="eyebrow">Step 1 of 2</span>
        <h1 className="h-disp text-[32px] mt-2 mb-3">What&apos;s your website?</h1>
        <p className="text-ink-soft mt-0 mb-8">TRND reads it, works out what you sell, and names the competitors running Meta ads to your customer.</p>
        <UrlForm defaultUrl={typeof url === "string" ? url : brand?.url} />
      </div>
    );
  }
  if (brand.last_scan_at || isScanning(brand)) redirect("/app");

  const rivals = await listRivals(brand.id);
  return (
    <div className="max-w-[760px]">
      <span className="eyebrow">Step 2 of 2</span>
      <h1 className="h-disp text-[32px] mt-2 mb-3">These are {brand.name}&apos;s rivals.</h1>
      <p className="text-ink-soft mt-0 mb-2">{brand.summary}</p>
      <p className="text-ink-soft mt-0 mb-8">
        Remove any that aren&apos;t, and add any we missed. Then TRND reads every ad they&apos;re running.
      </p>
      <div className="card mb-5">
        <RivalList rivals={rivals} />
      </div>
      <div className="card mb-8">
        <AddRivalForm />
      </div>
      <div className="flex items-center gap-4">
        <form action={scanNowAction}>
          <SubmitButton pending="Starting…">Start watching {rivals.length} rivals</SubmitButton>
        </form>
        <a className="text-[14px] text-ink-faint underline" href="/app/setup?again=1">
          Wrong site? Start over
        </a>
      </div>
    </div>
  );
}
