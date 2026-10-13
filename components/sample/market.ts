import type { CreativeSpec } from "./creative";

/**
 * The invented market the marketing pages show: Halo, a shower-filter brand,
 * and four rivals. Every brand, ad and number here is made up.
 */

export interface SampleAd {
  rival: string;
  domain: string;
  days: number;
  versions: number;
  status: "active" | "new" | "stopped";
  body: string;
  title: string;
  cta: string;
  angle: string;
  offer?: string;
  creative: CreativeSpec;
}

export const SAMPLE_ADS: SampleAd[] = [
  {
    rival: "Clearwell",
    domain: "clearwell.co",
    days: 94,
    versions: 6,
    status: "active",
    body: "I blamed my shampoo for three years. Turns out it was my water. Two weeks with Clearwell and my hair stopped breaking.",
    title: "The filter that fixes hard water",
    cta: "Shop now",
    angle: "Customer review",
    creative: { kind: "review", bg: "#e9dccb", fg: "#3b2f25", quote: "My hair stopped breaking in two weeks.", who: "Megan R.", brand: "Clearwell" },
  },
  {
    rival: "Tidewell",
    domain: "tidewell.com",
    days: 2,
    versions: 1,
    status: "new",
    body: "New: the year-supply bundle. Three filters for $79, shipped every four months. Never think about it again.",
    title: "A year of soft water, $79",
    cta: "Shop now",
    angle: "Bundle offer",
    offer: "3 for $79",
    creative: { kind: "offer", bg: "#1f3a5f", fg: "#ffffff", big: "$79", small: "A full year of filters, delivered.", brand: "Tidewell" },
  },
  {
    rival: "Marlow",
    domain: "marlowhome.com",
    days: 71,
    versions: 5,
    status: "active",
    body: "Slow mornings start here. Filtered water and a showerhead that looks like it belongs in your home.",
    title: "The Marlow Showerhead",
    cta: "Learn more",
    angle: "Lifestyle",
    creative: { kind: "product", bg: "#dfe3d5", bottle: "#8a9a74", label: "Marlow", text: "Slow mornings start here." },
  },
  {
    rival: "Fenn",
    domain: "fennwater.com",
    days: 128,
    versions: 4,
    status: "active",
    body: "Hard water is why your hair feels like straw. Fenn's vitamin C cartridge fixes it in two weeks or your money back.",
    title: "Softer hair in 2 weeks",
    cta: "Shop now",
    angle: "Problem / solution",
    creative: { kind: "statement", bg: "#f2e3d5", fg: "#5a2e1a", text: "Your shampoo isn't the problem.", brand: "Fenn" },
  },
];

export const SAMPLE_RIVALS = [
  { name: "Clearwell", live: 14, new7: 2, killed7: 1, longest: 94, cadence: [1, 0, 2, 1, 0, 3, 1, 2, 0, 2] },
  { name: "Tidewell", live: 9, new7: 3, killed7: 0, longest: 128, cadence: [0, 1, 0, 0, 2, 0, 1, 1, 0, 3] },
  { name: "Marlow", live: 6, new7: 0, killed7: 2, longest: 71, cadence: [2, 0, 0, 1, 0, 0, 1, 0, 0, 0] },
  { name: "Fenn", live: 8, new7: 1, killed7: 0, longest: 128, cadence: [0, 0, 1, 0, 0, 1, 0, 0, 2, 1] },
];
