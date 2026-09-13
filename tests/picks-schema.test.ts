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
    script("Price anchor", "Setting the price against a salon color correction makes it an easy yes."),
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
