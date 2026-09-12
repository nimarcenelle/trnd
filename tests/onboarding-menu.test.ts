import { describe, expect, it } from "vitest";

import { mergeServices, priceFromCents } from "../lib/onboarding/menu-doc";

describe("onboarding menu merge", () => {
  it("prices the rows the site named but couldn't price, and adds the rest", () => {
    const rows = [
      { name: "Brown Sugar Oat Latte", price: "" },
      { name: "Harvest Spice Latte", price: "" },
      { name: "Whole Leaf Tea", price: "" },
    ];
    const found = [
      { name: "Brown sugar oat latte (16oz)", price_cents: 625 },
      { name: "Harvest Spice Latte", price_cents: 650 },
      { name: "Cappuccino", price_cents: 475 },
      { name: "Croissant", price_cents: null },
    ];
    expect(mergeServices(rows, found)).toEqual([
      { name: "Brown Sugar Oat Latte", price: "6.25" },
      { name: "Harvest Spice Latte", price: "6.50" },
      { name: "Whole Leaf Tea", price: "" },
      { name: "Cappuccino", price: "4.75" },
      { name: "Croissant", price: "" },
    ]);
  });

  it("never overwrites a price the owner typed, and drops the empty placeholder row", () => {
    const rows = [{ name: "Espresso", price: "3" }, { name: "", price: "" }];
    const merged = mergeServices(rows, [{ name: "Espresso", price_cents: 350 }, { name: "Latte", price_cents: 500 }]);
    expect(merged).toEqual([
      { name: "Espresso", price: "3" },
      { name: "Latte", price: "5" },
    ]);
  });

  it("keeps one empty row when nothing was found", () => {
    expect(mergeServices([{ name: "", price: "" }], [])).toEqual([{ name: "", price: "" }]);
  });

  it("formats cents as the wizard's dollar strings", () => {
    expect(priceFromCents(700)).toBe("7");
    expect(priceFromCents(2450)).toBe("24.50");
    expect(priceFromCents(null)).toBe("");
  });
});
