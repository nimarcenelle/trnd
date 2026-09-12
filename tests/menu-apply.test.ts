import { describe, expect, it } from "vitest";

import { describePlan, planMenuApply } from "../lib/documents/menu-apply";
import type { Service } from "../lib/db/types";

const svc = (name: string, price_cents: number | null = null): Service => ({
  id: `id-${name.toLowerCase().replace(/\W+/g, "-")}`,
  business_id: "b", name, description: null, price_cents, is_active: true,
});

// The real shape: Caffe Driade, 13 services, every one "no price".
const driade = [
  svc("Featured Pour Over Coffee"),
  svc("Brown Sugar Oat Latte"),
  svc("Driade Shake"),
  svc("Whole Leaf Tea"),
];

describe("applying a menu to services that already exist", () => {
  it("fills prices on the rows the business already lists", () => {
    const plan = planMenuApply(driade, [
      { name: "Brown Sugar Oat Latte", price_cents: 675 },
      { name: "The Driade Shake", price_cents: 850 },
    ]);
    expect(plan.priced.map((p) => [p.name, p.price_cents])).toEqual([
      ["Brown Sugar Oat Latte", 675],
      // Loose match: "The Driade Shake" on the menu is "Driade Shake" here.
      ["Driade Shake", 850],
    ]);
    expect(plan.added).toHaveLength(0);
  });

  it("never overwrites a price the owner already set", () => {
    const plan = planMenuApply([svc("Driade Shake", 900)], [{ name: "Driade Shake", price_cents: 850 }]);
    expect(plan.priced).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("adds what the menu has and the business does not", () => {
    const plan = planMenuApply(driade, [{ name: "Cortado", price_cents: 450 }]);
    expect(plan.added).toEqual([{ name: "Cortado", price_cents: 450 }]);
  });

  it("does not rename anything the owner typed", () => {
    const plan = planMenuApply([svc("Driade Shake")], [{ name: "THE DRIADE SHAKE (16oz)", price_cents: 850 }]);
    expect(plan.priced[0].name).toBe("Driade Shake");
  });

  it("matches one menu item to one service, never the same row twice", () => {
    const plan = planMenuApply(
      [svc("Latte")],
      [{ name: "Latte", price_cents: 500 }, { name: "Latte", price_cents: 900 }],
    );
    expect(plan.priced).toHaveLength(1);
    expect(plan.priced[0].price_cents).toBe(500);
  });

  it("ignores menu items with no usable price rather than zeroing a row", () => {
    const plan = planMenuApply([svc("Whole Leaf Tea")], [{ name: "Whole Leaf Tea", price_cents: null }]);
    expect(plan.priced).toHaveLength(0);
  });

  it("caps how many new items one upload can introduce", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `Item ${i}`, price_cents: 100 }));
    expect(planMenuApply([], many).added).toHaveLength(40);
  });

  it("says plainly what it did", () => {
    const plan = planMenuApply(driade, [
      { name: "Brown Sugar Oat Latte", price_cents: 675 },
      { name: "Cortado", price_cents: 450 },
    ]);
    expect(describePlan(plan)).toBe("Read your menu and priced 1 item, added 1 new one.");
  });

  it("says so when nothing matched, instead of claiming success", () => {
    expect(describePlan(planMenuApply(driade, []))).toMatch(/Nothing on that menu matched/);
  });
});
