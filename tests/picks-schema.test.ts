import { describe, expect, it } from "vitest";

import { pickWriteSchemaFor } from "../lib/picks/schema";

const script = (label: string, thesis: string) => ({
  variant_label: label,
  thesis,
  hook: "That crust on the showerhead is on your hair too",
  beats: [
    { visual: "Close on white crust around a chrome showerhead", on_screen_text: "This is on your hair", vo: "" },
    { visual: "Hands twist the old head off in one move", on_screen_text: "", vo: "Sixty seconds, no tools." },
    { visual: "Water runs clear through the new filtered head", on_screen_text: "Filtered", vo: "" },
  ],
  direction: {
    show: "A real bathroom, the old showerhead still on the wall, then the filter going on by hand in one shot.",
    say: "Name the problem the way the customer does, then say plainly what the filter changes about the water.",
    prove: "What the filter removes, as the product page states it. No results promised.",
  },
  cta: "The Wall Mount Filtered Showerhead, $149",
  duration_seconds: 20,
});

const write = (finding: string, bet_what: string) => ({
  finding,
  bet_what,
  guardrail: null,
  scripts: [
    script("Problem first", "Opening on the crust makes the hard water problem visible before any claim."),
    script("The switch", "Showing a one-minute install answers the renter's fear of plumbing."),
    script("Side by side", "Setting the price against a salon color correction makes it an easy yes."),
  ],
});

const messages = (r: ReturnType<ReturnType<typeof pickWriteSchemaFor>["safeParse"]>) =>
  r.success ? [] : r.error.issues.map((i) => i.message);

describe("a finding the model writes", () => {
  const strict = (term: string) => pickWriteSchemaFor({ term, deltaPct: 22, gap: true });

  it("passes when it names a real gap about the item the bet runs", () => {
    const r = strict("hard water").safeParse(
      write(
        'Your customers are searching "hard water." Your product page says "Wall Mount Filtered Showerhead."',
        "Run the Wall Mount Filtered Showerhead on Reels as the renter-friendly hard water fix",
      ),
    );
    expect(messages(r)).toEqual([]);
  });

  it("fails when its item isn't the item the bet runs", () => {
    const r = strict("everything shower").safeParse(
      write(
        'Your customers are searching "everything shower." Your product page says "Shower Steamers."',
        "Pitch the Wall Mount Filtered Showerhead on Reels as the base of the everything shower",
      ),
    );
    expect(messages(r)).toContain("the item in the finding must be the item bet_what runs");
  });

  it("fails when the brand already says it the customer's way, and passes with what the page leads with", () => {
    const bet = "Run the Handheld Filtered Showerhead on Reels for the skincare routine";
    expect(
      messages(strict("filtered showerhead").safeParse(write('Your customers are searching "filtered showerhead." Your product page says "Handheld Filtered Showerhead."', bet))),
    ).toContain('the brand already uses the customer\'s words; name what the page leads with instead ("leads with")');
    expect(
      messages(strict("filtered showerhead").safeParse(write('Your customers are searching "filtered showerhead." Your product page leads with "1.8 GPM."', bet))),
    ).toEqual([]);
  });

  it("leaves the keyless template to the older rules", () => {
    const loose = pickWriteSchemaFor({ term: "everything shower", deltaPct: 22 });
    const r = loose.safeParse(
      write('Your customers are searching "everything shower." Your product page says "Shower Steamers."', "Pitch the showerhead"),
    );
    expect(messages(r)).toEqual([]);
  });
});

describe("a script sells the pick's price", () => {
  it("reads every way a price is written", async () => {
    const { pricesMentioned } = await import("../lib/picks/schema");
    expect(pricesMentioned("This fifty nine dollar towel is all that touches my wet hair")).toEqual([59]);
    expect(pricesMentioned("Get The Dry Shampoo for $28. Twenty-eight dollars well spent, or 30 bucks with shipping")).toEqual([28, 30, 28]);
    expect(pricesMentioned("One hundred forty nine dollars for a showerhead")).toEqual([149]);
    expect(pricesMentioned("No prices here")).toEqual([]);
  });

  it("rejects a script that quotes another item's price", async () => {
    const { validatePickWrite } = await import("../lib/picks/schema");
    const script = (hook: string, i: number) => ({
      variant_label: `Variant ${i}`,
      thesis: `Thesis number ${i}, long enough to pass the base schema on its own`,
      hook,
      beats: [],
      cta: "Shop the cream for $38",
      duration_seconds: 20,
      direction: { show: "A woman working the cream through damp hair at her bathroom sink", say: "Talk about skipping the forty minute heat routine on wash day", prove: "Show the hair drying soft" },
    });
    const write = {
      finding: 'Your customers are searching "frizz halo." Your product page says "The Smoothing Air Dry Cream."',
      bet_what: "Sell The Smoothing Air Dry Cream on TikTok for $38",
      guardrail: null,
      scripts: [script("How to fix a frizz halo", 1), script("This fifty nine dollar towel is all that touches my wet hair", 2), script("Throwing damp hair in a claw clip", 3)],
    };
    const wrong = validatePickWrite(write, { term: "frizz halo", deltaPct: null, priceCents: 3800 });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toContain("scripts.1: names a price of $59 while the item is $38");
    // Without a known price the mismatch cannot be judged, but a hook that names a price is still price-led.
    const noPrice = validatePickWrite(write, { term: "frizz halo", deltaPct: null, priceCents: null });
    expect(noPrice.ok).toBe(false);
    if (!noPrice.ok) expect(noPrice.error).toContain("leads with the price");
  });
});

describe("no price-led scripts", () => {
  it("rejects a hook that opens on the price, and a route named for one", async () => {
    const { validatePickWrite } = await import("../lib/picks/schema");
    const script = (label: string, hook: string) => ({
      variant_label: label,
      thesis: `Thesis for ${label}, long enough to pass the base schema on its own`,
      hook,
      beats: [],
      cta: "Shop The Dry Shampoo for $28",
      duration_seconds: 20,
      direction: { show: "A woman patting the powder into her roots at her bathroom sink", say: "Talk about skipping wash day without the itch", prove: "Show the powder blend in" },
    });
    const write = {
      finding: 'Your customers are searching "dry shampoo itchy scalp." Your product page says "The Dry Shampoo."',
      bet_what: "Pitch The Dry Shampoo at $28 on TikTok as the powder that extends wash day",
      guardrail: null,
      scripts: [script("Problem first", "Day three hair should not hurt your scalp"), script("Price anchor", "Twenty eight dollars to skip wash day"), script("The ritual", "Brushing your dry shampoo in changes the morning")],
    };
    const r = validatePickWrite(write, { term: "dry shampoo itchy scalp", deltaPct: null, priceCents: 2800 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("scripts.1: leads with the price");
  });
});

describe("the price of an item the draft itself sells", () => {
  it("is allowed, while any other price is not", async () => {
    const { validatePickWrite } = await import("../lib/picks/schema");
    const script = (hook: string, i: number) => ({
      variant_label: `Route ${i}`,
      thesis: `Thesis ${i}, long enough to pass the base schema on its own`,
      hook,
      beats: [],
      cta: "Shop The Towel for $59",
      duration_seconds: 20,
      direction: { show: "Wet hair wrapped in the towel at the bathroom mirror", say: "Talk about what a bath towel does to wet hair", prove: "Show the hair after ten minutes" },
    });
    const write = {
      finding: 'Your customers are searching "microfiber towel for drying hair." Your product page says "The Wet Hair Duo."',
      bet_what: "Pitch The Towel on TikTok as a heatless wash day ritual for $59",
      guardrail: null,
      scripts: [script("A bath towel pulls right at your roots", 1), script("Wet hair breaks when you twist it into a claw clip", 2), script("The towel that finally lets me air dry", 3)],
    };
    // The bundle is $92; the bet sells the $59 towel.
    expect(validatePickWrite(write, { term: "microfiber towel for drying hair", deltaPct: null, priceCents: 9200, allowedPriceCents: [5900] }).ok).toBe(true);
    expect(validatePickWrite(write, { term: "microfiber towel for drying hair", deltaPct: null, priceCents: 9200 }).ok).toBe(false);
  });
});

describe("the validator's complaints, as feedback", () => {
  it("names each rejected line once, and nothing for a non-validation failure", async () => {
    const { validationFeedback } = await import("../lib/ai/pick-writer");
    expect(validationFeedback({ issues: [{ path: ["scripts", 0], message: "leads with the price" }, { path: ["scripts", 0], message: "leads with the price" }, { path: ["finding"], message: "must quote the term" }] })).toBe("scripts.0: leads with the price; finding: must quote the term");
    expect(validationFeedback(new Error("model down"))).toBeNull();
  });
});
