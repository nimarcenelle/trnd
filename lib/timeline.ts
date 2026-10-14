import type { Ad, AdChange, RivalEmail, SiteChange } from "@/lib/db/types";
import { libraryLink } from "@/lib/format";

/**
 * One timeline across the three signal streams: ad launches and stops, website
 * changes and marketing emails, newest first. Pure, so the briefing, the
 * timeline page and a rival's page all build it the same way.
 */

export type Channel = "ad" | "site" | "email";

export interface TimelineEvent {
  id: string;
  at: string;
  channel: Channel;
  rivalId: string;
  title: string;
  detail: string | null;
  /** A short label for the badge: "New ad", "Price down", "Promo email". */
  tag: string;
  tone: "pos" | "neg" | "warn" | "info" | "plain";
  href: string | null;
  external: boolean;
  image: string | null;
}

const SITE_TAG: Record<SiteChange["kind"], { tag: string; tone: TimelineEvent["tone"] }> = {
  new_product: { tag: "New product", tone: "pos" },
  dropped_product: { tag: "Dropped", tone: "neg" },
  price_up: { tag: "Price up", tone: "warn" },
  price_down: { tag: "Price down", tone: "warn" },
  sale_started: { tag: "Sale", tone: "warn" },
  sale_ended: { tag: "Sale ended", tone: "plain" },
  promo_added: { tag: "Promotion", tone: "warn" },
  promo_removed: { tag: "Promo ended", tone: "plain" },
  message_changed: { tag: "New message", tone: "info" },
};

const EMAIL_TAG: Record<string, string> = {
  promo: "Promo email",
  launch: "Launch email",
  newsletter: "Newsletter",
  content: "Content email",
  retention: "Retention email",
  announcement: "Announcement",
  other: "Email",
};

const AD_TAG = {
  launched: { tag: "New ad", tone: "pos" },
  stopped: { tag: "Ad stopped", tone: "neg" },
  proven: { tag: "Proven ad", tone: "warn" },
} as const;

export function buildTimeline(input: {
  adChanges: (AdChange & { ad: Ad | null })[];
  site: SiteChange[];
  emails: RivalEmail[];
  emailHref: (e: RivalEmail) => string;
}): TimelineEvent[] {
  const ads: TimelineEvent[] = input.adChanges
    .filter((c) => c.ad)
    .map((c) => ({
      id: `ad:${c.id}`,
      at: c.detected_at,
      channel: "ad",
      rivalId: c.rival_id,
      title: c.ad!.hook ?? c.ad!.title ?? (c.ad!.body ?? "").slice(0, 120),
      detail: c.ad!.angle ? `${c.ad!.angle}${c.ad!.offer && c.ad!.offer !== "none" ? ` · ${c.ad!.offer}` : ""}` : null,
      tag: AD_TAG[c.kind].tag,
      tone: AD_TAG[c.kind].tone,
      href: libraryLink(c.ad!.archive_id),
      external: true,
      image: c.ad!.image_url,
    }));
  const site: TimelineEvent[] = input.site.map((c) => ({
    id: `site:${c.id}`,
    at: c.detected_at,
    channel: "site",
    rivalId: c.rival_id,
    title: c.title,
    detail: c.before && c.after ? `${c.before} → ${c.after}` : (c.after ?? c.before),
    tag: SITE_TAG[c.kind]?.tag ?? "Website",
    tone: SITE_TAG[c.kind]?.tone ?? "plain",
    href: c.url,
    external: true,
    image: null,
  }));
  const emails: TimelineEvent[] = input.emails
    .filter((e) => e.kind !== "confirmation")
    .map((e) => ({
      id: `email:${e.id}`,
      at: e.received_at,
      channel: "email",
      rivalId: e.rival_id,
      title: e.subject || "(no subject)",
      detail: [e.offer && e.offer !== "none" ? e.offer : null, e.theme, e.is_repeat ? "repeat" : null].filter(Boolean).join(" · ") || e.preview,
      tag: EMAIL_TAG[e.kind ?? "other"] ?? "Email",
      tone: e.kind === "promo" ? "warn" : e.kind === "launch" ? "pos" : "info",
      href: input.emailHref(e),
      external: false,
      image: null,
    }));
  return [...ads, ...site, ...emails].sort((a, b) => b.at.localeCompare(a.at));
}

/** Events grouped by calendar day (UTC), newest day first. */
export function byDay(events: TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const days = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const d = e.at.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return [...days].map(([day, events]) => ({ day, events }));
}
