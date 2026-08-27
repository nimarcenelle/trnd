import { titleCase } from "@/lib/text";

/**
 * The zero-budget move: a ready-to-paste organic post built from what TRND
 * already knows — this week's pick, the customer's own words, and the right
 * tags. Most owners' most frequent marketing act is a social post, not an
 * ad; every week should hand them one, spend or no spend. Deterministic on
 * purpose: instant, free, and grounded in stored data only.
 */
export function buildOrganicPost(opts: {
  term: string;
  businessName: string;
  /** The built campaign's hook, when one exists — the sharpest line we have. */
  hook?: string | null;
  /** Customers' literal phrases from the review digest. */
  copyHooks?: string[];
  hashtags: string[];
}): string {
  const lines: string[] = [];

  if (opts.hook) {
    lines.push(opts.hook);
  } else {
    lines.push(`${titleCase(opts.term)} — it's what we do at ${opts.businessName}.`);
  }

  const quote = (opts.copyHooks ?? []).find((h) => h.length >= 12 && h.length <= 90);
  if (quote) {
    lines.push("");
    lines.push(`"${quote.replace(/^["“]|["”]$/g, "")}" — a recent guest`);
  }

  lines.push("");
  lines.push("This week's slots are open — booking link in bio.");
  lines.push("");
  lines.push(opts.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));

  return lines.join("\n");
}
