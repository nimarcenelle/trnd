import "./env";

/**
 * Pre-launch quality eval: runs the real pipeline — founding analysis,
 * relevance judging, campaign generation, claims guard — over a matrix of
 * synthetic businesses (odd niches, small metros, every category) and grades
 * the outputs. Entirely in memory; touches no store.
 *
 *   pnpm eval:quality            # deterministic judges only (no key needed)
 *   GEMINI_API_KEY=… pnpm eval:quality   # full: briefs, model judge, campaigns
 *
 * Exit 1 on hard failures: a mismatched trend judged relevant, a campaign
 * shipping unsupported numeric claims, or a model brief thinner than spec.
 */

import { generateBusinessBrief } from "../lib/ai/brief";
import { buildClaimFacts, campaignTexts, findUnsupportedClaims } from "../lib/ai/claims";
import { generateCampaign } from "../lib/ai/index";
import type { Business, BusinessBrief, Opportunity, Service, Signal } from "../lib/db/types";
import { isGeminiConfigured } from "../lib/env";
import { buildBusinessFitContext, judgeTermRelevance } from "../lib/recommend/relevance";

interface EvalCase {
  name: string;
  category: string;
  city: string;
  region: string;
  price_band: string;
  services: { name: string; price?: number }[];
  /** Probe terms with expected fit: judged relevance must land on the right side. */
  probes: { term: string; relevant: boolean }[];
}

const CASES: EvalCase[] = [
  {
    name: "Ebb & Flow Contrast Therapy",
    category: "Fitness studios",
    city: "New York",
    region: "NY",
    price_band: "$$$",
    services: [
      { name: "Contrast Therapy Session (Sauna + Cold Plunge)", price: 65 },
      { name: "Cold Plunge Drop-In", price: 40 },
      { name: "Infrared Sauna Session", price: 55 },
    ],
    probes: [
      { term: "cold plunge benefits", relevant: true },
      { term: "sauna vs steam room", relevant: true },
      { term: "marathon recovery", relevant: true },
      { term: "teeth whitening before wedding", relevant: false },
      { term: "reformer pilates", relevant: false },
    ],
  },
  {
    name: "Smoke Signal BBQ",
    category: "Restaurants & cafés",
    city: "Waco",
    region: "TX",
    price_band: "$$",
    services: [
      { name: "Brisket Plate", price: 19 },
      { name: "Family Rib Pack", price: 54 },
    ],
    probes: [
      { term: "brisket near me", relevant: true },
      { term: "father's day cookout", relevant: true },
      { term: "espresso martini", relevant: false },
      { term: "matcha latte", relevant: false },
    ],
  },
  {
    name: "Golden Hour Med Spa",
    category: "Health & beauty",
    city: "Scottsdale",
    region: "AZ",
    price_band: "$$$",
    services: [
      { name: "Hydrafacial", price: 210 },
      { name: "Lip Filler Consult", price: 0 },
    ],
    probes: [
      { term: "skin barrier repair", relevant: true },
      { term: "lip flip vs filler", relevant: true },
      { term: "gutter cleaning", relevant: false },
      { term: "ceramic coating", relevant: false },
    ],
  },
  {
    name: "Second Spin Vinyl & Vintage",
    category: "Retail & boutiques",
    city: "Asheville",
    region: "NC",
    price_band: "$$",
    services: [
      { name: "Used Records", price: 12 },
      { name: "Vintage Denim", price: 45 },
    ],
    probes: [
      { term: "vintage denim haul", relevant: true },
      { term: "record store day", relevant: true },
      { term: "lip filler", relevant: false },
    ],
  },
];

let evalId = 0;
function makeBusiness(c: EvalCase): { business: Business; services: Service[] } {
  const id = `eval-${++evalId}`;
  return {
    business: {
      id,
      owner_id: "eval-owner",
      name: c.name,
      category: c.category,
      city: c.city,
      region: c.region,
      country: "US",
      lat: null,
      lng: null,
      radius_miles: 5,
      website: null,
      price_band: c.price_band,
      brand_voice_notes: null,
      photo_urls: [],
      social_handles: {},
      market: "local",
      monthly_ad_spend: null,
      ad_platforms: [],
      created_at: new Date().toISOString(),
    },
    services: c.services.map((s, i) => ({
      id: `${id}-s${i}`,
      business_id: id,
      name: s.name,
      description: null,
      price_cents: s.price != null ? Math.round(s.price * 100) : null,
      is_active: true,
    })),
  };
}

function makeSignal(term: string, category: string): Signal {
  return {
    id: `eval-sig-${term}`,
    source: "google_trends",
    term,
    normalized_term: term.toLowerCase().replace(/\s+/g, "_"),
    category,
    geo: "US",
    metric_type: "search_interest",
    value: 60,
    delta_pct: 38,
    window_days: 7,
    captured_at: new Date().toISOString(),
    raw: {},
  } as Signal;
}

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ FAIL ${msg}`);
};
const pass = (msg: string) => console.log(`  ✓ ${msg}`);
const info = (msg: string) => console.log(`  · ${msg}`);

async function main() {
  console.log(
    `[eval] ${CASES.length} synthetic businesses — Gemini ${isGeminiConfigured ? "ON (full pipeline)" : "OFF (deterministic judges only)"}\n`,
  );

  for (const c of CASES) {
    const { business, services } = makeBusiness(c);
    console.log(`${business.name} — ${business.category}, ${business.city}, ${business.region}`);

    // 1. Founding analysis depth (model path only — the fallback's stock
    // shape is covered by unit tests).
    let brief: BusinessBrief | null = null;
    if (isGeminiConfigured) {
      const generated = await generateBusinessBrief(business, services);
      brief = { ...generated, target_customer: generated.target_customer ?? null, id: "eval-brief", created_at: new Date().toISOString() };
      const modelWritten = !brief.model_used.startsWith("trnd-template");
      if (!modelWritten) {
        fail(`brief fell back to the template (${brief.model_used})`);
      } else {
        if (brief.watch_terms.length >= 18) pass(`watchlist depth: ${brief.watch_terms.length} terms`);
        else fail(`watchlist thin: ${brief.watch_terms.length} terms (< 18)`);
        if (brief.lexicon.length >= 12) pass(`lexicon: ${brief.lexicon.length} words`);
        else fail(`lexicon thin: ${brief.lexicon.length} words (< 12)`);
        if (brief.subreddits.length >= 3) pass(`subreddits: ${brief.subreddits.join(", ")}`);
        else fail(`subreddits thin: ${brief.subreddits.length} (< 3)`);
        const uniq = new Set(brief.watch_terms.map((t) => t.toLowerCase().trim()));
        if (uniq.size < brief.watch_terms.length) fail("duplicate watch terms");
      }
    }

    // 2. Deterministic relevance judge vs labeled probes.
    const ctx = buildBusinessFitContext(business, services, brief);
    for (const probe of c.probes) {
      const j = judgeTermRelevance(probe.term, business.category, ctx);
      const ok = probe.relevant ? j.relevance >= 0.5 : j.relevance < 0.5;
      if (ok) pass(`"${probe.term}" → ${j.relevance.toFixed(2)} (${probe.relevant ? "relevant" : "mismatch"}: ${j.kind})`);
      else fail(`"${probe.term}" judged ${j.relevance.toFixed(2)} but expected ${probe.relevant ? "≥0.5" : "<0.5"} — ${j.reason}`);
    }

    // 3. Model judge on the same probes — the two judges must agree on the
    // hard mismatches (a mismatch the model judge rates ≥0.5 is a failure).
    if (isGeminiConfigured && brief) {
      const { judgeSignalRelevance } = await import("../lib/ai/gemini");
      const candidates = c.probes.map((p) => ({ term: p.term, metric: "search_interest" }));
      const judged = await judgeSignalRelevance(business, brief, services, candidates);
      for (let i = 0; i < c.probes.length; i++) {
        const probe = c.probes[i];
        const j = judged.get(i);
        if (!j) {
          fail(`model judge skipped "${probe.term}"`);
          continue;
        }
        if (!probe.relevant && j.relevance >= 0.5) fail(`model judge rated mismatch "${probe.term}" at ${j.relevance}`);
        else if (probe.relevant && j.relevance < 0.3) fail(`model judge buried relevant "${probe.term}" at ${j.relevance}`);
        else pass(`model judge: "${probe.term}" → ${j.relevance}`);
      }
    }

    // 4. One full campaign; every number in the copy must trace to a fact.
    if (isGeminiConfigured) {
      const signal = makeSignal(c.probes.find((p) => p.relevant)!.term, business.category);
      const opportunity: Opportunity = {
        id: "eval-opp",
        business_id: business.id,
        signal_id: signal.id,
        week_of: new Date().toISOString().slice(0, 10),
        score: 7.5,
        rationale: "eval",
        matched_service_id: services[0].id,
        competitor_gap: null,
        status: "new",
        created_at: new Date().toISOString(),
      } as Opportunity;
      const campaign = await generateCampaign(
        { business, signal, opportunity, service: services[0], brief },
        () => {},
      );
      const facts = buildClaimFacts({ business, services, signal, opportunity });
      const leftover = findUnsupportedClaims(
        campaignTexts(campaign.result.angle, campaign.result.assets),
        facts,
      );
      if (campaign.model_used.startsWith("trnd-template")) {
        info("campaign fell back to the template — model path not exercised");
      } else if (leftover.length === 0) {
        pass(`campaign clean of unsupported claims (hook: "${campaign.result.angle.hook.slice(0, 70)}…")`);
      } else {
        fail(`campaign ships unsupported claims: ${leftover.map((x) => `"${x.text}"`).join(", ")}`);
      }
    }
    console.log("");
  }

  console.log(failures === 0 ? "[eval] PASS — all checks green" : `[eval] ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[eval] crashed:", err);
  process.exit(1);
});
