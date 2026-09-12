import type { DocumentDigest, Service } from "@/lib/db/types";

/**
 * Apply a menu document to services that already exist.
 *
 * `lib/onboarding/menu-doc.ts` does this for the wizard, but it works on
 * name/price strings the owner is still typing — there are no rows in the
 * database yet. Once a business exists the same job needs real ids, and
 * that path was never built: `mergeServices` is called from the onboarding
 * wizard and nowhere else, so a business whose menu lives on Toast, Yelp or
 * Square and who onboarded before the handover shipped has thirteen
 * services reading "no price" and no way back but editing each by hand.
 * Caffe Driade is exactly that business.
 *
 * The rules are the wizard's, because an owner should not get a different
 * answer from the same file in a different place:
 *
 * - A price already set is never overwritten. The owner's number wins over
 *   a model's read of a PDF, always.
 * - Matching is loose in the same way — either name containing the other —
 *   because "Driade Shake" on a menu is "The Driade Shake" in the row.
 * - Items the menu has and the business does not are added, not silently
 *   dropped: a menu is the better record of what is sold.
 * - Nothing is renamed. A row the owner typed keeps the words they chose.
 */

export interface MenuApplyPlan {
  /** Existing services that gain a price. */
  priced: { id: string; name: string; price_cents: number }[];
  /** Items on the menu that the business does not list yet. */
  added: { name: string; price_cents: number | null }[];
  /** Menu items already priced here — reported so the UI can say so. */
  unchanged: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cap on how many new items one upload may introduce — a 200-line PDF of
 * modifiers should not become 200 services. */
const MAX_ADDED = 40;

export function planMenuApply(
  services: Service[],
  found: DocumentDigest["services_found"],
): MenuApplyPlan {
  const plan: MenuApplyPlan = { priced: [], added: [], unchanged: 0 };
  const taken = new Set<string>();

  for (const item of found) {
    const name = item.name?.trim();
    if (!name) continue;
    const key = norm(name);
    if (!key) continue;

    const match = services.find((s) => {
      if (taken.has(s.id)) return false;
      const sk = norm(s.name);
      return sk.length > 0 && (sk === key || sk.includes(key) || key.includes(sk));
    });

    if (match) {
      taken.add(match.id);
      const cents = item.price_cents;
      if (typeof match.price_cents === "number" && match.price_cents > 0) {
        plan.unchanged += 1;
      } else if (typeof cents === "number" && cents > 0) {
        plan.priced.push({ id: match.id, name: match.name, price_cents: cents });
      }
      continue;
    }

    if (plan.added.length < MAX_ADDED && !plan.added.some((a) => norm(a.name) === key)) {
      plan.added.push({ name: name.slice(0, 80), price_cents: item.price_cents ?? null });
    }
  }

  return plan;
}

/** One line an owner can check the result against without opening the list. */
export function describePlan(plan: MenuApplyPlan): string {
  const bits: string[] = [];
  if (plan.priced.length > 0) {
    bits.push(`priced ${plan.priced.length} item${plan.priced.length === 1 ? "" : "s"}`);
  }
  if (plan.added.length > 0) {
    bits.push(`added ${plan.added.length} new one${plan.added.length === 1 ? "" : "s"}`);
  }
  if (plan.unchanged > 0) bits.push(`left ${plan.unchanged} already priced`);
  if (bits.length === 0) return "Nothing on that menu matched — no prices changed.";
  return `Read your menu and ${bits.join(", ")}.`;
}
