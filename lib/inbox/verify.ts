import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whether an inbound-mail webhook is really from our mail service. Resend
 * signs with Svix (a whsec_ secret, svix-* headers); anything else sends our
 * shared secret as ?secret= or an x-trnd-secret header.
 */
export function verifyInbound(opts: { secret: string; body: string; headers: Headers; url: string; now?: number }): boolean {
  const { secret, body, headers } = opts;
  if (!secret) return false;
  if (secret.startsWith("whsec_")) {
    const id = headers.get("svix-id") ?? headers.get("webhook-id");
    const ts = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
    const sigs = headers.get("svix-signature") ?? headers.get("webhook-signature");
    if (!id || !ts || !sigs) return false;
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (Math.abs(now - Number(ts)) > 300) return false;
    const expected = createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64")).update(`${id}.${ts}.${body}`).digest();
    return sigs.split(" ").some((part) => {
      const [version, sig] = part.split(",");
      if (version !== "v1" || !sig) return false;
      const got = Buffer.from(sig, "base64");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
  }
  const given = new URL(opts.url).searchParams.get("secret") ?? headers.get("x-trnd-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
