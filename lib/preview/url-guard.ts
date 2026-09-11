import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The website import runs behind a signed-in owner reading their own site.
 * The public snapshot does not: anyone can hand it a URL, so it is the one
 * fetch path in the product that needs a real SSRF guard. `normalizeUrl`
 * only checks the shape of a hostname — it would happily fetch
 * `http://169.254.169.254.nip.io/` or an internal host with a dot in it.
 *
 * So: http(s) only, no credentials, no non-standard ports, and every address
 * the hostname resolves to must be publicly routable. DNS is resolved here
 * rather than trusted from the string, because the attack is a public name
 * that points at a private address.
 */

/** Reserved/private IPv4 space, as [first octet, mask, match] rules. */
function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:10.0.0.1) hides a v4 address inside a v6 one.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true; // not an address we can reason about — refuse
}

export type UrlGuardResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string };

/**
 * Validates a URL for public, unauthenticated fetching. Returns the reason
 * in owner-readable language — this text reaches the page.
 */
export async function guardPublicUrl(raw: string): Promise<UrlGuardResult> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http and https addresses work here." };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "That address can't include a username or password." };
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    return { ok: false, reason: "That address uses a port we don't read." };
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || /\.(local|internal|localhost|home\.arpa)$/.test(host)) {
    return { ok: false, reason: "That looks like a private address, not a public website." };
  }
  // A bare IP is never a small business's website, and it skips DNS entirely.
  if (isIP(host)) {
    return { ok: false, reason: "Enter the website address, not an IP." };
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: "We couldn't find that website." };
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, reason: "That looks like a private address, not a public website." };
  }
  return { ok: true, url: u.toString(), host };
}
