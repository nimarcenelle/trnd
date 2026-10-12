import type { CreativeSpec } from "./creative";

/**
 * The invented market the marketing pages show: a shower-filter brand and its
 * rivals. Every name and ad here is made up.
 */

export interface SampleCam {
  rival: string;
  days: number;
  status: "live" | "new" | "proven" | "killed";
  creative: CreativeSpec;
}

export const SAMPLE_CAMS: SampleCam[] = [
  { rival: "Jolie", days: 94, status: "proven", creative: { kind: "ugc", from: "#c79c78", to: "#5a3b29", line: "It was my water.", sub: "I blamed my shampoo for 3 years" } },
  { rival: "AquaBliss", days: 2, status: "new", creative: { kind: "offer", from: "#3b86c0", to: "#173a58", line: "Year of filters", sub: "$79" } },
  { rival: "Canopy", days: 71, status: "live", creative: { kind: "product", from: "#b6c39f", to: "#4d5a37", line: "The ritual", sub: "your skin deserves" } },
  { rival: "Jolie", days: 39, status: "killed", creative: { kind: "offer", from: "#d8b79b", to: "#7a5640", line: "Back to school", sub: "15%" } },
  { rival: "Lumen", days: 128, status: "proven", creative: { kind: "product", from: "#e3a17a", to: "#7b3d22", line: "Hard water?", sub: "Softer hair in 2 weeks" } },
  { rival: "AquaBliss", days: 47, status: "live", creative: { kind: "ugc", from: "#79b1c9", to: "#1f4b5e", line: "47,000 reviews", sub: "my eczema finally calmed down" } },
];

export const SAMPLE_TICKER = [
  { kind: "new", text: "AquaBliss launched a video ad · “New: the year-supply bundle”" },
  { kind: "killed", text: "Jolie killed “Back to school, 15% off” after 39 days" },
  { kind: "proven", text: "Canopy's gifting ad passed 21 days live" },
  { kind: "new", text: "Jolie launched 3 variants of a dermatologist video" },
  { kind: "proven", text: "Lumen's “Hard water?” ad is now 128 days live" },
  { kind: "killed", text: "Canopy killed its founder-story video after 18 days" },
  { kind: "new", text: "Lumen launched a carousel · “Day 1 vs day 21”" },
] as const;
