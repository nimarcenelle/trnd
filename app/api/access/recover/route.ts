import { createHash } from "node:crypto";

import { activeSessionsFor, networkId } from "@/lib/essayodds/access";
import { sendAccessEmail } from "@/lib/essayodds/access-email";
import { recordSubscriberUse, subscriberUsedToday } from "@/lib/essayodds/saved";
import { isEssayOpen } from "@/lib/env";

/** Per network and per address, a day: enough to retry a typo, not enough to spam someone. */
const PER_DAY = { network: 5, email: 3 };
const SENT = { ok: true };

/** Emails the access links for every live purchase made with this address. The reply never says whether one exists. */
export async function POST(request: Request): Promise<Response> {
  if (!isEssayOpen) return Response.json({ error: "not_open" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return Response.json({ error: "email" }, { status: 400 });
  const net = networkId(request);
  const mail = createHash("sha256").update(`essayodds-recover:${email}`).digest("hex").slice(0, 24);
  if ((await subscriberUsedToday("use_recover", net).catch(() => 0)) >= PER_DAY.network) return Response.json({ error: "limit" }, { status: 429 });
  if ((await subscriberUsedToday("use_recover", mail).catch(() => 0)) >= PER_DAY.email) return Response.json(SENT);
  await recordSubscriberUse("use_recover", net);
  await recordSubscriberUse("use_recover", mail);
  try {
    const sessions = await activeSessionsFor(email);
    if (sessions.length) await sendAccessEmail(email, sessions);
  } catch (err) {
    console.error("[recover]", (err as Error).message);
  }
  return Response.json(SENT);
}
