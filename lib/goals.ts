import type { Objectives } from "@/lib/db/types";

/** The goals an owner can pick, shared by the form (client) and the pages (server). */
export const GOALS: { value: Objectives["goal"]; label: string; hint: string }[] = [
  { value: "new_customers", label: "Win new customers", hint: "First purchases at a good cost" },
  { value: "subscriptions", label: "Grow subscriptions", hint: "Recurring revenue" },
  { value: "launch", label: "Launch something new", hint: "A product, line or offer" },
  { value: "retention", label: "Bring customers back", hint: "Repeat purchases" },
  { value: "awareness", label: "Build awareness", hint: "Reach and recognition" },
];
