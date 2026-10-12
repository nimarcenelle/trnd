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

function Steps({ at }: { at: 1 | 2 }) {
  const steps = ["Your site", "Your rivals", "Watching"];
  return (
    <ol className="list-none p-0 m-0 grid grid-cols-3 gap-2 max-w-[520px]">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-col gap-2">
          <span className={`h-[3px] rounded-full ${i + 1 <= at ? "bg-mint" : "bg-bg-3"}`} />
          <span className={`label !text-[10px] ${i + 1 === at ? "!text-ink" : ""}`}>
            {String(i + 1).padStart(2, "0")} {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Two steps: the site, then the rivals to confirm before the first scan. */
export default async function SetupPage({ searchParams }: PageProps<"/app/setup">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const brand = await getBrand(user.id);
  const { url, again } = await searchParams;

  if (!brand || again) {
    return (
      <div className="max-w-[680px] mx-auto lg:mx-0 lg:mt-6">
        <Steps at={1} />
        <h1 className="disp text-[clamp(32px,4.5vw,48px)] mt-10">What&apos;s your website?</h1>
        <p className="text-[17px] text-ink-2 mt-4 mb-9 leading-[1.6] max-w-[560px]">
          TRND reads it, works out what you sell, and names the competitors running Meta ads to your customer. About 30 seconds.
        </p>
        <UrlForm defaultUrl={typeof url === "string" ? url : brand?.url} />
      </div>
    );
  }
  if (brand.last_scan_at || isScanning(brand)) redirect("/app");

  const rivals = await listRivals(brand.id);
  return (
    <div className="max-w-[820px] mx-auto lg:mx-0 lg:mt-6">
      <Steps at={2} />
      <h1 className="disp text-[clamp(30px,4.2vw,46px)] mt-10">We found {rivals.length} rivals for {brand.name}.</h1>
      {brand.summary && (
        <div className="inset px-4 py-3 mt-6 flex gap-3 text-[14px] leading-[1.6]">
          <span className="label !text-[10px] pt-[3px] shrink-0">Your brand</span>
          <span className="text-ink-2">{brand.summary}</span>
        </div>
      )}
      <p className="text-[16px] text-ink-2 mt-6 leading-[1.6]">Remove any that aren&apos;t real competitors and add any we missed. Then TRND reads every ad they&apos;re running.</p>

      <div className="panel mt-8">
        <RivalList rivals={rivals} />
        <div className="border-t border-line p-4 sm:p-5 bg-bg-2/50 rounded-b-xl">
          <AddRivalForm />
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
        <form action={scanNowAction}>
          <SubmitButton className="btn btn-primary btn-lg" pending="Starting…">
            <i className="dot dot-rec" /> Start watching {rivals.length} rivals
          </SubmitButton>
        </form>
        <a className="text-[14px] text-ink-3 hover:text-ink" href="/app/setup?again=1">
          Wrong site? Start over
        </a>
      </div>
    </div>
  );
}
