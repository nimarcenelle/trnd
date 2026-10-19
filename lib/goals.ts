import type { Goal } from "@/lib/db/types";

/** The goals a creator can pick, shared by the forms (client) and the pages (server). */
export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "followers", label: "Grow followers", hint: "Turn viewers into fans" },
  { value: "comments", label: "More comments", hint: "Build a community" },
  { value: "views", label: "More views", hint: "Reach new people" },
  { value: "deals", label: "Land brand deals", hint: "Look good to sponsors" },
  { value: "sales", label: "Sell something", hint: "Drive clicks to a shop" },
];

export const goalLabel = (g: Goal | undefined | null) => GOALS.find((x) => x.value === g)?.label ?? null;
