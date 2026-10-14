import type { Rival, SourceHealth } from "@/lib/db/types";
import { ago } from "@/lib/format";

type Tone = "ok" | "warn" | "bad" | "off";
const DOT: Record<Tone, string> = { ok: "bg-pos", warn: "bg-warn", bad: "bg-neg", off: "bg-line-strong" };

function Chip({ label, value, tone, title }: { label: string; value: string; tone: Tone; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-bg text-[12.5px]" title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      <span className="font-medium">{label}</span>
      <span className="text-ink-3">{value}</span>
    </span>
  );
}

function source(h: SourceHealth | undefined, fallbackAt: string | null | undefined, what: (h: SourceHealth) => string): { value: string; tone: Tone; title?: string } {
  if (h) {
    if (!h.ok) return { value: `failed ${ago(h.at)}`, tone: "bad", title: h.note ?? undefined };
    return { value: `${what(h)} · ${ago(h.at)}`, tone: h.note ? "warn" : "ok", title: h.note ?? undefined };
  }
  return fallbackAt ? { value: `read ${ago(fallbackAt)}`, tone: "ok" } : { value: "next scan", tone: "off" };
}

/** What TRND last pulled for a company from each source, and whether it worked. */
export default function DataStatus({ rival, inbox }: { rival: Rival; inbox: boolean }) {
  const ads = source(rival.health?.ads, rival.last_scraped_at, (h) => `${h.count ?? 0} ads${h.via === "apify" ? " (backup reader)" : ""}`);
  const site = rival.website ? source(rival.health?.site, rival.site_checked_at, (h) => (h.count ? `${h.count} products` : "read")) : { value: "no website", tone: "off" as Tone };
  const email: { value: string; tone: Tone } = !inbox
    ? { value: "off", tone: "off" }
    : rival.email_status === "receiving"
      ? { value: "receiving", tone: "ok" }
      : rival.email_status === "subscribed"
        ? { value: "signed up, waiting", tone: "ok" }
        : rival.email_status === "manual"
          ? { value: "needs signup", tone: "warn" }
          : { value: "next scan", tone: "off" };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip label="Ads" {...ads} />
      {!rival.is_self && <Chip label="Website" {...site} />}
      {!rival.is_self && <Chip label="Emails" {...email} />}
    </div>
  );
}
