import { randomBytes } from "node:crypto";

import type { NewTestWatch } from "@/lib/db/types";
import { brandDomain } from "@/lib/intel/discover-brands";

/**
 * What the free read's "watch for my ad" form may store, checked and
 * trimmed. The page sends what the read showed it; nothing here trusts a
 * length or a shape it did not check.
 */

export const MAX_OPEN_PER_EMAIL = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WatchRequest {
  email?: unknown;
  website?: unknown;
  brand?: { name?: unknown; domain?: unknown } | null;
  brief?: { title?: unknown; hook?: unknown; onScreen?: unknown } | null;
  rival?: { advertiser?: unknown; runningDays?: unknown; text?: unknown } | null;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Pure: the row to insert, or the one line that says what is missing. */
export function parseWatchRequest(body: WatchRequest, now = new Date()): { ok: true; row: NewTestWatch } | { ok: false; reason: string } {
  const email = text(body.email, 200).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: "That email doesn't look right." };
  const website = text(body.website, 300);
  const domain = brandDomain(text(body.brand?.domain, 200) || website);
  const brandName = text(body.brand?.name, 120);
  const title = text(body.brief?.title, 160);
  const hook = text(body.brief?.hook, 400);
  if (!domain || !brandName || !title || !hook) return { ok: false, reason: "Run a read first, then watch its test." };
  const onScreen = text(body.brief?.onScreen, 200);
  const advertiser = text(body.rival?.advertiser, 120);
  const rivalText = text(body.rival?.text, 400);
  const days = typeof body.rival?.runningDays === "number" && Number.isFinite(body.rival.runningDays) ? Math.max(0, Math.round(body.rival.runningDays)) : null;
  const rival =
    advertiser && rivalText
      ? { advertiser, text: rivalText, startedOn: days === null ? null : new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10) }
      : null;
  return {
    ok: true,
    row: {
      token: randomBytes(24).toString("base64url"),
      email,
      website: website || `https://${domain}`,
      domain,
      brand_name: brandName,
      title,
      hook,
      on_screen: onScreen && onScreen.toLowerCase() !== "none" ? onScreen : null,
      rival,
    },
  };
}
