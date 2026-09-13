# BUILD LOG

Chronological. Newest at the bottom. See DECISIONS.md and BLOCKED.md for the why.

## Recon (07:00 UTC)
- Repo was completely empty (no commits, no `main`). Node 22, pnpm 10 available.
- Egress: registry.npmjs.org allowed; trends.google.com / reddit.com / news.google.com
  denied by network policy → live ingestion blocked in this container (BLOCKED.md).
- No Docker daemon → no local Supabase stack; no Supabase env vars (BLOCKED.md).
- GRWM cloned; key extraction denied by the permission layer (BLOCKED.md).

## Milestone 1 — Scaffold (07:07 UTC)
- Next.js 16.3.2, App Router, TS strict, Tailwind v4, pnpm. Vitest wired (`pnpm test`).
- Full token system from the brief in `app/globals.css` — both themes, `@theme` mapping
  for Tailwind utilities, shared primitives (btn/pill/eyebrow/card/field/skeleton).
- `/styleguide` renders every color token, type ramp, buttons, pills, cards, fields in
  both themes; `components/theme-toggle.tsx` follows the OS and persists an override
  (pre-paint init script in the root layout, no flash).
- Design references checked in under `design/`; brief at `TRND-BUILD-BRIEF.md`.
- `pnpm build`, `pnpm lint`, `pnpm test`: all green.

## Milestone 2 — Data layer (07:16 UTC)
- `supabase/migrations/0001_init.sql`: full §7 schema + demo_requests. RLS on every
  table; ownership via `owns_business()`; signals/series/learnings are shared reads,
  cron-only writes; signal daily dedupe via expression unique index.
- `lib/db`: one `Repo` interface, two implementations — Supabase (RLS/service-role) and
  demo store (`.demo-data/store.json`) that enforces the same ownership rules in code.
- `pnpm seed`: 58 illustrative signals across all seven categories (source='seed'),
  1,740 sparkline series points, 8 learning priors. Verified counts by running it.
- Tests: static RLS coverage over migrations, demo-repo cross-business read/write
  blocking, signal dedupe, env-gated live Supabase RLS test (skips loudly — BLOCKED.md).
- build/lint/test green.

## Milestone 3 — Auth + onboarding (07:20 UTC)
- Mode-agnostic session API (`lib/auth/session.ts`): Supabase Auth (password + magic
  link + /auth/callback code exchange) when configured; demo mode uses scrypt-hashed
  local accounts and an HMAC-signed cookie. `proxy.ts` (Next 16's middleware) refreshes
  Supabase sessions; pass-through in demo mode.
- /login, /signup styled per the design system; magic-link button explains itself in
  demo mode instead of pretending to send mail.
- /onboarding: 5-step wizard (name → category → location+radius+price band → services &
  prices → brand voice), single server action writes businesses + services, cannot be
  skipped — /app layout redirects to it until a business exists.
- /app shell: sticky nav, business name, sign out, and a visible DEMO MODE banner when
  Supabase isn't configured.
- Verified against the prod server: /login 200, /signup 200, /app → 307 /login.
- build/lint/test green.

## Milestone 4 — Landing page port (07:35 UTC)
- `design/trnd-landing.html` ported to React: sticky nav + theme toggle, scrolling signal
  ticker, animated hero signal→ad-card SVG, old way / TRND way split, interactive
  five-step explainer, signal proof cards, flywheel (CSS-driven spin, honors
  reduced-motion), roadmap, pricing band, demo request form, footer with the
  "illustrative" disclosure.
- Demo form posts a server action into the real `demo_requests` table (demo store when
  Supabase is absent). Reveal-on-scroll is opt-in via JS with a visible-by-default
  fallback, exactly like the reference.
- Caught a stale prod server process serving an old build (looked like landing.css was
  lost); after killing it, verified both themes via headless Chromium screenshots.
- build/lint/test green.

## Milestone 5 — Signal ingestion (07:40 UTC)
- `SignalAdapter` interface + five adapters in the brief's order: Google Trends daily
  RSS (lexicon-classified into categories, noise dropped), Reddit public JSON (per-
  category subreddits, upvote-velocity ranking, descriptive UA), Google News RSS
  (corroboration counts), Trends interest-over-time (direct widget endpoints — no
  unmaintained package; fast-tripping circuit breaker), YouTube (key-gated). TikTok
  intentionally not attempted (no viable free API — known gap).
- Shared hardened HTTP: 10s timeout, exponential backoff (max 3), per-adapter circuit
  breaker; 4xx never retried. Ingest succeeds with partial results; raw responses land
  in signals.raw; DB unique index makes re-runs idempotent per day.
- `POST /api/cron/ingest` (CRON_SECRET bearer) + `pnpm job:ingest`; vercel.json cron
  schedules added.
- Proved the degrade path by running the job in this egress-blocked container: all
  sources 403, breakers open, run completes cleanly with partial (0) results. Fixture
  unit tests cover every parser + classifier + delta math.
- build/lint/test green.

## Milestones 6 + 7 — Scoring, recommendations, Gemini generation, campaign screen (08:05 UTC)
- `lib/scoring.ts`: the whole formula in one file per §8, every component 0..1 with a
  plain-English reason; unit tests cover saturation, service token-matching, gap proxy,
  neutral priors, and the full score.
- `lib/recommend`: weekly top-5 opportunity generation per business (idempotent per
  week); `/api/cron/recommend` + `pnpm job:recommend`. `/app` also self-heals: first
  visit of a week scores inline so the screen is never empty — demo works seconds after
  onboarding.
- `/app`: the hero screen. One recommendation — term, 0-10 score badge, rationale,
  30-day mint sparkline, matched service, competitor gap, source (+ "illustrative"
  marker for seeded rows), one primary action. `/app/opportunities`: ranked list with
  accept / dismiss / restore.
- `lib/ai`: Gemini wrapper (`gemini.ts` is the only SDK import) — models resolved from
  live ListModels (never hardcoded), documented fallback chains, Pro for the two
  creative calls, structured JSON output validated with Zod, one retry then the
  deterministic brand-voiced fallback generator (`fallback.ts`) which validates against
  the same schemas. model_used + prompt_version stored on every campaign.
- `/app/campaigns/[id]`: angle/hook/offer/audience header, 5 headlines, 3 primary
  texts, 3 timestamped video scripts, 3 static briefs, landing copy — all copyable;
  copy-all; JSON + Meta-CSV export via route handler (draft→exported); mark-as-launched
  (→ live, opportunity → launched).
- Playwright E2E green (24s): signup → onboarding → recommendation → campaign → launch.
  (Root-caused a nasty hang: clicks on buttons that detach mid-navigation retry forever
  with no default action timeout — explicit click timeouts fix it.)

## Milestone 8 — Results + learnings (08:20 UTC)
- `/app/results`: manual entry per live campaign (impressions/clicks/spend/bookings/
  revenue), history table with CTR / cost-per-result / revenue, and a visible "what
  TRND has learned" strip. Structured so a Meta API sync lands without schema change
  (`campaign_results.source`).
- `lib/results/compute.ts`: CTR/CPA math and the lift function (0.5 neutral; CTR-led
  with booking and profitability nudges), blended into `learnings` by sample size —
  which the scoring formula already consumes. The loop is closed and unit-tested.
- E2E now runs the whole flywheel: … → launch → enter results → history row (2.50%
  CTR) → learnings updated. Green in 24s.

## Milestone 9 + polish — Hardening and professional pass (08:55 UTC)
- `/app/settings`: business profile edit, services add/toggle/remove.
- Error boundaries (root + app), branded 404, loading skeletons for /app.
- Mobile: verified zero horizontal scroll at 375px on landing + all five app screens
  (headless Chromium, measured `scrollWidth` diff).
- Found & fixed a real data bug: unit tests were clobbering `.demo-data` because the
  store path resolved at import time (ES import hoisting beats the test's env var) —
  paths are now lazy; verified by hashing the store across a test run.
- Fixed "consult consult" copy duplication in the fallback generator.
- Lighthouse on `/`: **99 / 100 / 96 / 100** (was 88/94/96/100).
  - Root-caused SI=20s via the LH filmstrip: the render-blocking Google Fonts
    stylesheet hangs behind this sandbox's proxy → blank page for ~14s. Fonts now load
    async (media=print swap + noscript fallback) — a straight win in any environment.
  - Reveal-on-scroll rewritten per-element: content already on screen never flickers
    out on slow devices; below-fold content reveals as before.
  - Infinite animations (ticker, dot pulse, dash flow, flywheel spin) start on first
    user input; one-shot intro animations play on load.
  - AA contrast: new `--amber-text` / `--mint-text` tokens for small text on light
    backgrounds; `--ink-faint` deepened to #7D5C39; heading order fixed (h4/h5 → h3).
- Full suite green: lint, 25 unit tests, E2E happy path (24s).

---

# Morning Report

**1. What works end to end right now?**
Everything in the demo path, with zero credentials: landing page (with working demo-
request capture) → signup → 5-step onboarding → `/app` shows a scored recommendation
(formula + plain-English rationale + 30-day sparkline) → one click builds the full
campaign (5 headlines, 3 primary texts, 3 video scripts, 3 static briefs, landing copy,
audience) → copy/JSON/Meta-CSV export → mark launched → enter results → history table →
learnings update and feed next week's scores. Proven by a Playwright E2E that runs the
whole loop in ~24s (`pnpm test:e2e`). Lighthouse on `/`: 99/100/96/100. Mobile 375px
clean everywhere. Both themes everywhere.

**2. What's stubbed, and where's the seam?**
Three things, all in `BLOCKED.md` with exact seams: **Supabase** (schema + RLS + auth
fully written; add three env vars and run the migrations — the repo interface swaps
automatically), **Gemini** (wrapper, live model resolution, versioned prompts,
structured output all written; add `GEMINI_API_KEY` — the permission layer here refused
to let me grep GRWM for it), and **live ingestion in this container only** (all five
adapters implemented + fixture-tested; this sandbox 403s the sources — run
`pnpm job:ingest` anywhere with normal egress and real rows flow).

**3. What did I decide that you might disagree with?**
- `matchSignalsToBusiness` is the deterministic scoring formula, not a third Gemini
  call — §8's transparency requirement won over §9's list. Easy to add as a re-rank.
- Broad SMB categories with med-spa as best-served vertical, per the brief's own
  resolution of the vision-deck tension.
- Landing's infinite animations wait for first user input (paint stability); intro
  animations still play.
- `main` is bootstrapped at the scaffold commit so a PR could exist at all (empty repo).

**4. The single highest-value next hour**
Create a Supabase project, paste the three env vars, run the migrations, and run the
E2E against it. That flips auth + RLS + persistence to production-grade in one sitting
and surfaces any RLS policy friction while everything's fresh. (Second place: drop the
Gemini key into `.env.local` and read five generated campaigns for voice quality.)

**5. Run it locally**
```
pnpm install
cp .env.example .env.local
pnpm seed
pnpm dev          # → sign up at /signup, onboard, done
pnpm test         # 25 unit tests
pnpm test:e2e     # the whole loop, headless
```

## P2 — Sellable-product pass (post-review, user request)
- Fonts now self-hosted via @fontsource (Bricolage Grotesque Variable, Inter, IBM Plex
  Mono) — no Google Fonts dependency at build OR runtime; real typography everywhere.
- New app design system (`app/app/app.css`): page headers, KPI tiles, panels, badges,
  score dial, labeled breakdown meters, status timeline, in-feed ad preview, data
  tables, opportunity rows with hover elevation.
- /app is now a weekly intelligence briefing: KPI row (signals watched, ranked count,
  launches, avg CTR), hero rec with radial score dial + four labeled scoring meters
  (weights printed), rationale as checked bullets, provenance badges (source + metric +
  illustrative flag), interactive 30-day demand chart (crosshair + tooltip, dataviz-skill
  validated colors), suggested launch window, next-in-line runner-ups with mini
  component bars, market-pulse top movers.
- /app/opportunities: ranked rows with rank #, delta chip, source/fit/status badges,
  mini component bars, per-row sparkline.
- /app/campaigns/[id]: status timeline (draft→exported→live→complete), in-feed ad
  preview mock, launch plan (price-band-sized daily budget + test flight, A/B day plan,
  launch checklist), grouped creative sections with counts.
- /app/results: KPI tiles (spend, revenue, ROAS, avg CTR vs labeled illustrative
  category benchmark), CTR-by-campaign bar chart with benchmark line, upgraded history
  table with vs-benchmark markers, learnings panel.
- /app/settings: panels + data & integrations status grid (Supabase/Gemini/sources/Meta
  sync) with honest connect states.
- `lib/recommend/explain.ts` re-derives score components server-side so every screen
  can show the formula's work. E2E updated + full gate green (lint, 25 unit, E2E).

## P3 — Dark-first brand identity (user request, logo supplied)
- Logo checked in at `design/trnd-logo.png`; palette sampled from it directly.
- Dark default on `:root` (warm near-black / off-white / sage-mint / softened gold);
  light is now the explicit toggle choice. `viewport.themeColor` set to match.
- New `components/brand.tsx` wordmark (mint dot + wide-tracked TRND, per the logo) used
  in the landing nav/footer, auth shell, onboarding, and app nav; `app/icon.svg` favicon
  derived from it.
- Theme toggle simplified to attribute-based (no OS media dependency).
- Full gate green (lint, unit, E2E). Verified light theme via toggle end to end.

## P4 — Layered disclosure (user request: high info without text walls)
- New `lib/recommend/insights.ts`: structured insight engine. Every score explains
  itself as four insights — momentum / fit / open door / track record — each a ≤8-word
  bold headline plus exactly one sentence of detail, phrased from the live data. Plus a
  "do this next" action (launch-by date + budget) and a one-line results takeaway.
- /app hero: run-on rationale replaced by four scannable headlines; "The full read"
  grows the same rows in place (no duplication). Facts grid replaced by a single
  amber "DO THIS NEXT" action strip. 
- /app/opportunities: rows collapsed to term + delta + one fit/gap line + score;
  "why this score" drawer opens the full read, weighted meters, sparkline, provenance.
- Campaign: A/B paragraph became a 3-step test-flight plan (days 1–3 / 4–6 / kill
  rule); scripts, statics, and landing copy are collapsible sections with counts —
  headlines and primary texts stay open as the first-reach assets.
- Results: one-line "READ" takeaway under the KPIs (CTR vs benchmark + ROAS verdict).
- 4 new unit tests on the insight engine (headline length caps enforced in test);
  E2E updated for the disclosures. Full gate green.

## P4.1 — Casing polish (user request)
- `lib/text.ts`: titleCase (small-words-aware) + sentenceCase helpers, unit-tested.
- Signal terms render as Title Case wherever they act as titles (hero, runner-ups,
  market pulse, opportunity rows, campaign source-signal fact); insight headlines are
  sentence-cased at the source. Ad copy keeps its natural casing on purpose.

## P5 — Complete-product audit (user request)
Walked the whole flow (landing → signup → onboarding → weekly rec → campaign → launch →
results → learnings) and closed the gaps:
- **/app/campaigns index** (new nav tab): campaigns grouped Live / Drafts / Exported /
  Complete with status timelines and next-step hints; empty state links to This week.
- **Pending states on generation**: "Build the campaign" buttons now show a spinner +
  "Building your campaign…" via useFormStatus — matters once Gemini latency is real.
- **Magic-link failure feedback**: /login now explains an expired/invalid link instead
  of failing silently (callback already redirected with ?error=auth).
- **Self-serve funnel**: landing hero + pricing band link to /signup (see DECISIONS.md).
- **SEO layer**: metadataBase + OpenGraph/Twitter cards with a generated brand OG image
  (public/og.png), robots.txt (blocks /app, /api, /onboarding), sitemap.xml; scaffold
  SVG leftovers removed.
- E2E extended to cover the campaigns index; full gate green.

## P6 — UI cleanup sweep (user request)
- Demo-mode banner toned down to a slim centered strip (informative, not shouty).
- Campaigns-index cards use a compact status timeline (dots + current label) instead of
  the full labeled one, which wrapped in narrow cards.
- Trend chart gridlines snap to round numbers (1/2/5×10ⁿ step picker).
- Zero-state KPI copy ("first one is a click away"); tighter app-nav spacing ≤520px.
- Full-inventory screenshot pass over all 16 screens; gate green.

## P7 — Data honesty + business brief (user + CJ requests)
- Migration 0002: `learnings.source` seed/measured + new `business_briefs` table (RLS'd).
- Insight engine: seeded priors now read "Illustrative prior — no results yet"; only
  measured results are ever counted or claimed as track record. Results-screen chips
  mark seeds as dashed "illustrative". First real result replaces a seed prior.
- Dev demo store reset to clean seed (0 users/campaigns/results, 8 seed-labeled
  learnings); Playwright now uses an isolated `.demo-data-e2e` wiped per run — verified
  the dev store stays byte-identical after a full E2E pass.
- **Business brief card** (CJ's idea): generated when a business joins — what you do
  well, your moat, edges to press in ads, what to avoid in ads (category-aware,
  incl. platform-policy pitfalls). Deterministic fallback now, Gemini Flash path wired
  behind the same seam. Rendered on This week; lazily generated for older accounts.
- New unit tests: brief fallback specificity, history-insight provenance. Gate green.

## P8 — Website-first onboarding (user request)
- Onboarding step 1 is now the business website + name. On Continue, TRND fetches the
  site (one owner-initiated request, 8s timeout, identified UA) and prefills category,
  location, and priced offerings; the owner confirms instead of typing.
- Extraction: JSON-LD (LocalBusiness et al) → title/meta → price-line heuristics with
  fee filtering; Gemini Flash refinement layered on when configured. Unit-tested
  against fixture HTML (name, city/state, category, "$7 matcha" style menu rows,
  delivery-fee exclusion).
- Failure is a first-class path: unreachable/unreadable sites show a one-line note and
  onboarding continues manually. In this sandbox egress is blocked, so that path is
  the one that runs here (BLOCKED.md).
- Gate green (43 unit tests, E2E).

## P9 — Full founding analysis + zero-question onboarding (user request)
- **Site crawl**: import now reads the homepage plus up to four relevant pages
  (menu/pricing/services/about, keyword-scored internal links, parallel fetch,
  failures dropped). Offerings are pooled across pages; the price band is inferred
  from real prices (median vs. per-category thresholds, Gemini refinement on the
  labeled multi-page corpus, which can also return `price_band`).
- **Fewer questions**: a successful import collapses steps 2-5 into one prefilled
  "Confirm what we read" screen — name, category, city/state, radius, price band,
  services, voice, all editable, one submit. The stepper survives only as the
  no-website / failed-import path (unchanged, still E2E-covered).
- **Full analysis** (brief-2): `business_briefs` grew positioning, customer_segments,
  market_context, pricing_read, seasonality, first_moves (migration 0003, defaults
  keep old rows valid). Gemini path now runs on **Pro** (flash retry → deterministic
  fallback) and is fed the crawled site text — onboarding round-trips it through the
  form so there's no refetch; settings/lazy paths re-crawl best-effort. The
  deterministic fallback fills every section per-category and grounds pricing_read /
  first_moves in the actual menu ("Wood-Fired Margherita at $16").
- **Staleness fixed**: settings edits (business fields, add/toggle/delete service)
  regenerate the analysis via `after()` so saves stay instant; briefs with an old
  prompt_version render as-is once and upgrade after the response.
- This week card redesigned: positioning lead, who's-buying/market/pricing/seasonality
  row, the original four columns, numbered "Your first moves".
- Verified end-to-end against a local fixture site (localhost egress works): crawl
  found all 6 menu items from /menu.html, inferred $$, confirm screen → /app showed
  the full analysis. Gate green (47 unit tests, E2E, build).

## P10 — Import that survives the real web (fixing "doesn't seem to be succeeding")
Diagnosed against the store's real onboarding attempt (Sweathouz, a deep
`/chapel-hill-book-now/` URL that yielded one hand-typed service) and live probes
of real sites (`scripts/probe-import.ts`, kept as a diagnostic).
- **Headless render fallback** (`lib/import/render.ts`): when the plain fetch 403s
  or returns a JS husk (<500 chars of text) or a bot-protection interstitial, the
  page is rendered with full Chromium in new-headless mode (real-Chrome fingerprint,
  normal UA, one 5s wait for JS challenges to clear). Playwright is a devDependency
  + `serverExternalPackages`; where it isn't installed the import stays fetch-only.
  Passes Cloudflare on sweathouz.com; hard blocks now fail with an honest
  "bot protection blocked the read" instead of extracting "Attention Required!".
- **Deep-link handling**: a pasted inner page (menu/booking) is kept as a corpus
  page and the site root is crawled alongside it for identity.
- **Extraction fixes**: www/apex hostname mismatch no longer discards every nav
  link; link dedupe ignores tracking params; JSON-LD parsing accepts any
  LocalBusiness subtype, reads `priceRange` as the band, and pulls priced items out
  of Menu/MenuItem/Product/Offer graphs; HTML entities decoded everywhere
  ("Kitchen &amp; Bar" → "& Bar"); storefront chrome ("Sale price:", gift cards)
  filtered from services; category is voted by keyword count across all crawled
  pages (one nav "menu" no longer beats a page full of "sauna"); barber/sauna/cold
  plunge added to Health & beauty keywords; exotic dash trims.
- Wizard note now says plainly when no menu could be read.
- Result on the failing case: sweathouz.com deep URL → SWTHZ, Health & beauty,
  Chapel Hill NC, $$, 6 priced services with clean names. Gate green
  (53 unit tests, E2E, build). Remaining lever: `GEMINI_API_KEY` in `.env.local`
  (BLOCKED.md) — without it the analysis is the template and extraction is
  heuristics-only.

## P11 — Gemini live + model retirement + landing polish (user requests)
- `GEMINI_API_KEY` now set in `.env.local` (gitignored). Verified live: the Sweathouz
  deep URL imports 8 priced offerings (memberships and packs the heuristics missed)
  and the founding analysis comes back Gemini-written and hyper-local (UNC/Duke
  segments, Estes Drive first moves, NC seasonality).
- **Model retirement fix**: Google 404s `gemini-2.5-pro` for new API keys and points
  at `gemini-3.1-pro-preview` — but `isStable()` rejected preview names, so resolve
  picked the dead stable id. Ranking now allows previews (highest version wins,
  stable beats preview at the same version), and every creative call (campaign angle,
  assets, brief) retries on Flash before falling back to the template — a retired
  pro id degrades to Flash, never silently to the template. Fallback chains updated.
- **Landing fixes** ("elements overlapping and childish"): hero "+34% this week" chip
  was drawn under the ad card — now end-anchored left of it; the ad-card's inner
  zigzag chart replaced with a quiet photo placeholder (sun + hills); flywheel's four
  clip-art circles with cramped two-line text replaced by the site's pill idiom
  anchored on the ring (viewBox widened so nothing clips); mobile nav ≤620px no
  longer wraps "Sign in" and the demo button onto the logo (tighter padding,
  nowrap) — verified numerically at 375px. Gate green.

## P12 — "Working SaaS" landing pass (vibe reference: hostie.ai, nothing copied)
What makes that site feel like a working product: the product shown as a real
thing, calm one-idea sections, persistent demo CTA, proof everywhere. TRND is
pre-launch and the data-honesty rule holds — no invented logos, testimonials, or
metrics — so the honest translation:
- **Hero product frame** replaces the abstract signal→ad SVG: the actual
  dashboard in a browser window (recommendation, ↑48% delta, demand sparkline,
  6.8/10 score dial, "Build the campaign" button, and the concrete output line
  "5 headlines · 3 primary texts · 3 scripts · targeting"). Reuses the spark
  draw-in animation; entrance slide; fully token-themed for both themes.
  hero-viz.tsx deleted along with its orphaned CSS/keyframes.
- **Floating "Request a demo" pill** (bottom-right) appears after the hero's own
  CTAs scroll away; reduced-motion safe; verified visible-at-1200/hidden-at-top.
- **E2E back to deterministic**: `next start` had begun loading `.env.local`, so
  "Build the campaign" made live Pro calls and blew the 45s wait. Playwright's
  webServer now blanks GEMINI_API_KEY — E2E exercises the fallback path with no
  LLM cost. Gate green (53 unit, E2E, build).
- Confirmed model resolution post-fix: flash `gemini-3.7-flash`, pro
  `gemini-3.1-pro-preview` — nothing resolves to retired 2.5 ids.

## P13 — Streaming site import (user request: feedback bit by bit)
The "Reading your site…" button used to sit frozen for 20-60s (crawl + headless
render + Gemini). The import is now a streaming NDJSON route with live narration:
- `POST /api/import` replaces the server action (same auth via session cookie,
  plus an explicit origin check). It streams one JSON line per event: status
  ("Reaching sweathouz.com…", "Their site runs on JavaScript — opening a real
  browser for /chapel-hill-book-now/", "Found 3 more pages worth reading: …",
  "Read /locations/", "AI pass — reading the pages like a person…"), a `partial`
  prefill the moment heuristics land, then `final` with the refined data + site
  text (or `error`).
- `fetchSiteCorpus` grew an optional onProgress callback (rendering / links /
  page events); other callers unchanged.
- Wizard consumes the stream: a live checklist under the fields (done lines get
  amber ✓, the current line pulses; reduced-motion safe; aria-live), found
  offerings appear as pills as soon as they're extracted, fields prefill on
  `partial` and refine on `final` — the owner's own typing is never clobbered
  (imported values tracked in refs). First feedback in ~1s instead of a minute
  of nothing.
- Verified live against the Sweathouz deep URL: 4 narration lines within 4s,
  review screen with all 8 services at the end. Gate green (53 unit, E2E, build).

## P14 — Dashboard v2 (user-supplied mockup: "do this typa shi")
Rework of the whole app UI to the direction of the shared trnd-dashboard-v2.html
mock — its vibe, mapped onto real data (its fabricated stats — reviews, booking
history, founded-year — were NOT reproduced; every number on screen is ours).
- **Palette**: warmer/punchier dark tokens (bg #110B05, amber #FFC72C, mint
  #2FC9C6, + --bg-3/--overlay-tint); light theme mostly unchanged. Cascades to
  the landing page for one brand.
- **Nav**: centered pill-tab bar (This week / Opportunities / Campaigns /
  Results / Snapshot / Settings), brand + business tag left, scrollable on
  mobile.
- **Letter grades** (lib/recommend/grade.ts, unit-tested): fixed score bands →
  A…C with a verdict line ("Strong opportunity · Worth acting on this week").
  Grade ring replaces the numeric dial on This week (breakdown meters stay for
  transparency); grade pills replace raw scores on runner-ups and the
  opportunities list. Per follow-up: the /10 number is gone from the UI
  entirely — letters only (score still drives everything underneath).
- **This week**: hero card now carries a "How to run it well" accordion
  (lib/recommend/howto.ts — category-keyed content angle / caption direction /
  hashtags incl. term + city tags) and a meta row (matched service, competitor
  gap, do-this-next, coverage). Business-brief card became a snapshot teaser
  strip (edge + watch-out chips) linking to the new page.
- **Company snapshot page** (/app/snapshot): the founding analysis as its own
  screen — profile bar from real profile facts, positioning lead, three-column
  do-well/edge/watch-outs, who's-buying/market/pricing row, seasonality + first
  moves, honest "How we built this" provenance (model + prompt version), and an
  owner-triggered Refresh action.
- **Opportunities**: leader row amber-bordered, mint sub-line
  ("↑47% conversation · matched to …"), insight tags as chips, grade pills.
- **Results**: proper empty state + blurred ghost table ("Preview — unlocks
  after your first launch").
- **Campaign page → 4-step builder**: 1 Shoot (static briefs as creative-
  direction cards, scripts disclosure) · 2 Write (headlines/primary texts +
  in-feed preview, live TikTok/Instagram tag links for the term, landing copy)
  · 3 Target (budget/radius/audience boxes + test flight) · 4 Launch
  (checklist, mark-launched/copy/export, honest Pro lock note).
- Removed: ScoreDial, MiniBars, ScoreBadge, BusinessBriefCard components.
- Verified live on every screen (fresh account, real Pro-generated campaign —
  header shows gemini-3.1-pro-preview). Gate green (55 unit, E2E, build).

## P15 — Star-rating breakdown (user request)
Score-component meters lost their far-right decimals and became five-star
ratings (half-star steps, amber fill, Google-ratings feel) — labels and
weights stay printed so the formula remains transparent; the raw numbers now
live only in the aria-labels and the scoring engine. Grade ring and pills
already letter-only. Gate green.

## P16 — Human-voiced import narration (user request)
The onboarding stream's status lines dropped their plumbing-speak: no more
"runs on JavaScript — opening a real browser for /path". Now: "Opening
sweathouz.com…", "Taking a closer look at your chapel hill book now page…",
"Read your home page", "Found 3 more pages worth reading — locations, …"
(numeric slugs filtered from the list), "Making sense of what we found…",
"Pulling out what you sell and what it costs…". Verified against the live
stream. Store re-zeroed after probes.

## P17 — TikTok Creative Center adapter (user request)
Sixth signal source: TikTok's public Creative Center trend board, per industry.
- Reverse-engineered live (probe kept at scripts/probe-tiktok-cc.ts): the
  current backing endpoint (CreativeOne/KnowledgeAPI/GetHashtagList) accepts
  plain JSON POSTs with NO signing — no browser, no key. Anonymous access caps
  each query at the top ~3 hashtags, so the adapter queries once per industry:
  7 TikTok industries mapped to the 7 TRND categories (ids verified against
  labels extracted from TikTok's own JS bundle — Food & Beverage → Restaurants,
  Beauty & Personal Care → Health & beauty, Sports & Outdoor → Fitness, Vehicle
  → Auto, Home Improvement → Home services, Apparel → Retail, Health → Dental
  & wellness).
- Each hashtag lands with post count, video views, a delta computed from the
  normalized 7-day popularity curve (trailing partial-day zero dropped), and
  daily series points that feed the demand sparkline. metric_type
  "conversation" so UI copy reads naturally.
- TikTok's industry tags are loose (celebrity/gaming crossovers reach Sports
  and Vehicle) — deliberately not lexicon-filtered: novel terms are the point,
  and the scorer's service-fit component (25%) is the junk filter by design.
- Wiring: source union + migration 0004 (signals_source_check gains 'tiktok'),
  SourceBadge label, POST support in the shared hardened fetch, adapter slot
  in the default ingest order. 5 new unit tests against a captured fixture.
- Live ingest run: tiktok_cc delivered 21 signals + 147 series points — the
  top live source of the run (Reddit 403'd from this IP, Trends IOT 429'd;
  circuit breakers degraded both cleanly). Gate green (60 unit, E2E, build).

## P18 — Snapshot-aware recommendations ("use the company snapshot to be intelligent")
Reported: Sweathouz (contrast therapy) got recommended teeth whitening —
category-level matching can't tell a cold-plunge studio from a dentist.
- **Relevance pass in the recommender**: after deterministic scoring, the top
  12 candidates go through one Flash call carrying the founding analysis
  (positioning + customer segments) and the actual service list; each trend
  gets relevance 0–1 + a one-line reason. The fit component becomes the judged
  relevance (applyRelevance in lib/scoring.ts — same published weights, score
  re-derived, matched-service claim dropped under 0.3 fit, reason appended to
  the rationale as "Snapshot read: …"). Wider pool means a relevant #9 can
  outrank junk #1. Non-fatal: no key / failed call → deterministic ranking
  stands.
- **Campaign prompts carry the snapshot** (PROMPT_VERSION gemini-2): the
  business block now includes positioning, top edges, and watch-outs as hard
  guidance, and the brief threads through GenerationContext from the build
  action.
- Verified live on the reporting account: "teeth whitening before wedding"
  sank from the top to 5.0 ("Not a cosmetic dental practice — your studio
  sells private infrared sauna and cold plunge suites"); new #1
  "naturalremedies" 7.2 ("a natural 60-minute recovery cycle of infrared heat
  and cold plunges"), #2 "iv hydration therapy" 6.7 ("adjacent recovery
  routine for the same UNC athletes seeking inflammation relief"). Both
  Sweathouz accounts re-ranked in place. Gate green (63 unit, E2E, build).

## P19 — Fit gates the score + the snapshot drives the watchlist
Follow-through on "hashtag hero" and the audit ("scrub thru and analyze"):
- **Humanized TikTok terms**: hashtag slugs become readable trend phrases at
  ingestion via one Flash call ("hygienetok" → "personal hygiene routines",
  "kbbq" → "korean bbq dining"); the raw tag stays in signals.raw and still
  powers hashtag suggestions and TikTok/IG trend links (tiktokHashtag helper).
  Injectable humanizer keeps the adapter unit-testable; identity fallback
  without a key.
- **Relevance now GATES the score**: applyRelevance scales the weighted sum by
  (0.3 + 0.7×fit) — momentum on a trend the business shouldn't touch caps in
  the C range ("Weak signal — watch, don't spend") instead of parading as a B.
  Judged-irrelevant rows (<0.15 fit) drop from the list entirely unless the
  whole pool is irrelevant, in which case the least-bad few stay, honestly
  graded, and This week's "Do this next" says "Thin week — nothing squarely
  fits."
- **The snapshot drives signal acquisition** (brief-3, migration 0005): the
  founding analysis now emits watch_terms — 5-8 search phrases this business's
  real customers use ("cold plunge chapel hill", "infrared sauna near me",
  "sports recovery chapel hill" for Sweathouz). Ingest unions every business's
  watchlist with the stock category terms into a category-tagged watch list
  consumed by the News, Trends-IOT, and YouTube adapters (fixing a latent bug:
  trends_iot rows used to land category-less and could never be ranked).
  Snapshot page shows the watchlist as chips.
- **"Re-rank this week"** button on This week: owner-triggered re-scoring of
  the current week through the full pipeline (deleteOpportunitiesForWeek repo
  method, campaign-referenced rows survive) — no more manual store surgery.
- Honesty polish: demand chart hidden when no series exists; "matched service"
  reads "New offer — nothing on your menu yet" instead of a vague placeholder.
- Verified live: Sweathouz's pool is genuinely irrelevant this week → all C
  (1.7-1.8) with correct reasons; watch terms fetched by News (6 coverage
  signals); Trends-IOT still 429s from this IP — from Vercel's cron IPs the
  personalized terms become rankable search-interest signals. Gate green
  (66 unit, E2E, build).

## P20 — UX perfection pass: no long waits, no dev-speak, de-tic'd prompts
Full scrub for waits, weird visuals, and imperfect copy (user request).
- **Onboarding finishes in ~1 second** (measured 1.0s to dashboard; was
  30-60s): the founding analysis is written via after() behind the redirect.
  The dashboard shows a "your founding analysis is being written" teaser, the
  Snapshot page holds a proper waiting state that refreshes itself
  (AutoRefresh client helper) — measured landing ~29s later, hands-free. The
  in-flight guard (briefLikelyInFlight, 5-min window on business.created_at)
  prevents duplicate generations from page visits.
- **Campaign build streams**: POST /api/campaigns/build narrates stages as
  NDJSON ("Reading the signal…", "Finding the angle that wins this week…",
  "Writing headlines, scripts, and creative briefs…", "Saving your
  campaign…") and the BuildCampaignButton shows them live on the button, then
  client-navigates to the finished campaign. Build logic extracted to
  lib/campaigns/build.ts (onStatus threads through generateCampaign →
  generateWithGemini); the old blocking server action is gone from both call
  sites.
- **Prompt dial-in**: the "Not X. Instead: Y." negation turn demoted from
  standing rule to at-most-once scalpel, with "vary sentence openings" added
  to the system voice and the relevance judge ("never open more than one
  reason with 'Not'"). Angle prompt now demands the customers' own words in
  the hook, the matched service's real price in the offer, and audience
  chosen from the snapshot's segments. PROMPT_VERSION gemini-3,
  BRIEF_PROMPT_VERSION brief-4 (existing outputs upgrade lazily). First
  post-change hook verified live: no template tic.
- **Copy scrub**: demo strip no longer tells users to "see BLOCKED.md";
  onboarding submit reads "Finishing setup…" (it is); e2e labels updated.
- Gate green (66 unit, E2E, build); probe account scrubbed from the store.

## P21 — Local signals, seasonal calendar, real competitor reads, real photos
The "rocket launcher" batch (user request: #4 fully, #1 sans image-gen, #2).
- **Meta Ad Library reads (#2)**: the public search page renders anonymously —
  probe confirmed full data (counts, advertisers, ad copy). New
  lib/signals/adlibrary.ts: pure text parser (unit-tested on a live fixture) +
  a Playwright-backed adapter (source 'meta_ads', metric 'ad_saturation',
  migration 0007) querying business-scoped watch terms and this week's ranked
  terms (city-suffixed), capped at 10 renders/run. competitorGap now prefers
  the REAL count (1 − count/60) over the news proxy; the hero shows "What
  competitors are running" with actual nearby ads. First live run delivered:
  "private sauna chapel hill → 4 ads (top advertiser: SweatHouz themselves)",
  "contrast therapy durham → 18 ads incl. Augment Wellness Durham opening
  soon", "infrared sauna benefits → 2,800 ads" (correctly saturated). Where
  Playwright is absent (serverless) the adapter skips and the proxy stands.
- **Local geo (#4)**: WatchTerm carries an optional geo; business watch terms
  query the business's state (US-NC) through Trends interest-over-time, and
  the recommender now passes geo so state signals rank alongside national
  (repos already supported it — nothing ever passed it).
- **Seasonal calendar (#4)**: lib/recommend/seasonal.ts — per-category demand
  moments with lead times (our data, no model). "Coming up — plan ahead" panel
  on This week: soonest three, amber-flagged when prep should already be
  underway.
- **Real photos (#1, no image-gen)**: the site import now harvests the
  business's own photography (og:image + content imgs; logo/banner/thumbnail
  filtering incl. filename-dimension heuristics; migration 0006
  businesses.photo_urls). The in-feed ad preview renders on a real photo, and
  the builder's creative-direction cards use their photos as starting frames.
  Static-brief prompt now demands phone-shootable setups in the owner's space.
- Timing note: ranked-term ad reads close on the NEXT daily ingest (ingest →
  rank → tomorrow's ingest reads the ranked terms) — by design, cron-shaped.
- New accounts appeared mid-work (Ellemes — real Atlanta med spa — and CJ's
  Sweathouz): Ellemes ranks 8.1 on genuinely fitting terms; Sweathouz stays
  honestly thin until local trend signals flow. Gate green (72 unit, E2E,
  build).

## P22 — The unjudged-ranking race (user screenshot: B+ hygiene for a sauna studio)
P20's fast-finish onboarding created a race: the first ranking runs the moment
the owner lands on the dashboard, before the founding analysis exists — no
brief, no relevance judge, so an ungated B+ ranking persisted for the week.
- **Brief lands → automatic re-rank** (lib/recommend/rerank.ts): every brief
  writer (onboarding after(), snapshot refresh, settings refresh, the /app
  missing-brief heal) now rebuilds the week's ranking once the analysis
  exists. Campaign-referenced rows survive. The re-rank button reuses the
  same helper.
- **Judge failure can no longer downgrade silently**: the relevance pass
  retries, and if it still fails while a snapshot is on file, the previous
  judged ranking is KEPT rather than overwritten with confident nonsense.
  (First-ever rank with no predecessor stays deterministic and is corrected
  by the brief-landing re-rank.)
- **Term dedupe** (dedupeByTerm, unit-tested): hashtag humanization varies
  day to day ("personal hygiene routines" vs "hygiene routines") — token-set
  containment collapses re-phrasings, keeping the stronger delta.
- Live store re-ranked: both Sweathouz accounts now hold judged C-grade thin
  weeks; Ellemes (a real med spa) ranks 8.3 on genuinely fitting terms — the
  same signal pool, correctly split by what each business actually is. Gate
  green (74 unit, E2E, build).

## P22b — Stable opportunity ids through re-ranks
The P22 auto-re-rank deleted and recreated rows, so any already-rendered
dashboard held dead opportunity ids — a build click landed on a deleted row
(caught by E2E). rerankWeek is now upsert-first: a signal that stays ranked
keeps its row id, only fallen-out rows are deleted (campaign-referenced rows
always survive), and the build button self-heals on a stale id by refreshing
and asking for one more click. recommendForBusiness returns the week's
opportunity ids. Gate green (74 unit, E2E, build).

## P23 — Enterprise scrub: keyless fit, billing, accounts, trust surface
The overnight "make it a complete product" pass. Four fronts, each gated green:

- **Deterministic fit gate** (lib/recommend/relevance.ts): the relevance judge
  no longer exists only when Gemini does. A per-category concept lexicon
  (cuisine-vs-mode aware) judges every candidate against the business's
  services, name, and voice notes; fit gates the total exactly like the model
  judge; mismatches drop off the list; insights say "Outside your lane"
  instead of dressing a mismatch up as a "new offer". Proof: identical seed
  signals now rank "family style takeout" #1 for a BBQ smokehouse (maps to
  its rib pack) while espresso martinis vanish from its list — and stay #1,
  legitimately, for a restaurant that actually has a bar. Follow-up fix: a
  template brief's stock watchlist no longer counts as business evidence.
- **Category-aware campaign copy** (lib/ai/fallback.ts): offers and CTAs
  speak each category's language — no more "consult, applied to your first
  visit" for a plate of ribs; band-based default prices per category.
- **Billing** (lib/billing/, /api/stripe/webhook, migration 0008): every
  business starts a tracked 14-day trial; STRIPE_* keys switch on hosted
  checkout ($49/$149), the customer portal, and webhook-driven plan state.
  Expired trials gate NEW campaign builds only; nothing ever locks without
  keys. RLS: owners read, service role writes.
- **Accounts & trust**: forgot-password (Supabase recovery → /auth/reset),
  change password (current-password verified in both modes), typed-DELETE
  account deletion with full data cascade in both stores; /terms + /privacy
  written to match the real product, linked from footer and signup;
  GET /api/health reports subsystem modes for uptime monitors.

Gate green: 89 unit tests, E2E happy path, lint, production build. Full
Playwright walkthrough re-verified (signup → onboarding → sensible ranking →
campaign → launch → results → billing/account panels), zero console errors.

### Morning Report (P23)
1. **End to end now**: everything from before, plus billing/trial state,
   account self-service, legal pages, health probe — and rankings that make
   sense for the specific business with zero keys.
2. **Stubbed, with seams**: Stripe (add 4 env vars + webhook — BLOCKED.md),
   Supabase, Gemini, YouTube unchanged. Meta ad-account sync still the
   roadmap item the schema is shaped for.
3. **Might disagree**: fit-gated scores read lower (an honest C beats a
   flattering B+); billing never locks keyless installs; service-role use
   for account deletion (DECISIONS.md).
4. **Highest-value next hour**: create the two Stripe prices, fill the env
   vars, run one live checkout against a test card, and flip
   NEXT_PUBLIC_SITE_URL — the product is then literally sellable.
5. **Run it**: `pnpm i && pnpm seed && pnpm dev` (demo), `pnpm test`,
   `pnpm test:e2e`, `pnpm build`.

## P24 — Detect v2: local-first signal
"Make Detect much better." The viability read named signal quality as the
company's biggest risk — national trending noise standing in for local
demand. This pass makes local measurement the default:

- **Metro resolution** (lib/signals/geo.ts): business city → Nielsen DMA geo
  (top ~50 US metros + suburb aliases, state-verified so Portland ME never
  becomes Portland OR) with coordinates. Google Trends accepts DMA geos —
  real sub-state demand measurement, free, that almost nobody uses.
- **Rising related queries** (adapters/trends-related.ts): per business watch
  term, per metro — the discovery half of Detect. Surfaces breakout phrasings
  nobody typed into a config; Breakout values capped at +400% so one outlier
  can't own a ranking.
- **Weather demand triggers** (adapters/weather.ts): Open-Meteo (keyless) per
  place; deterministic rules that fire only when the forecast crosses a line
  the recent past didn't — first heat wave → AC tune-ups, first freeze →
  heating/tire swaps, patio windows, rain streaks, wash-and-detail rebounds.
  Deltas are labeled heuristic; the insight layer says "forecast-derived,
  not a measured trend."
- **Autocomplete intent** (adapters/suggest.ts): keyless Google suggest reads
  per watch term — buying-intent counts plus discovered long-tail phrasings.
- **Locality-aware scoring**: metro-measured signal earns +0.5 (state +0.2)
  on the 10-scale, transparent in the rationale ("measured in your metro,
  not nationally"), surviving the relevance gate. Repos return national +
  state + in-state-metro rows together; geo strings humanize in the UI
  ("Atlanta metro").
- New sources 'weather' and 'google_suggest' (migration 0009), seeded
  weather-trigger examples for demo mode, settings/README updated.

Gate green: 109 unit tests (17 new for geo/weather/suggest/related/locality),
E2E, lint, build. Live-source calls remain fixture-tested here (sandbox
egress) — same seam as every other adapter: none needed, run `pnpm
job:ingest` anywhere with normal network.
## P23 — The inviting pass (Merciv-inspired warmth)
Side-by-side against merciv.com's hero (warm bone ground, badge eyebrow,
abundance headline, one warm CTA, tactile imagery) showed TRND's dark
terminal default working against its Main-Street audience.
- **Warm light is now the brand default**: the cream/ink/gold palette moves
  to bare `:root`; the terminal look lives on behind [data-theme="dark"].
  Stored preferences keep working — only the no-preference default flips.
- **Headline reframe**: "before your competitors do" → "before it's
  obvious" — the timing edge without the enemy. Competitor framing stays
  where it earns its place (old-way/TRND-way, saturation signals).
- **Ticker humanized**: sentence-case body type, mono reserved for the
  numbers. Landing eyebrows become bordered badges on bg-1; hero proof
  pills drop the mono voice.
- Still open (needs assets/permission): real photography and a named
  owner story on the landing — the biggest remaining warmth lever.
  Gate green (74 unit, E2E, build), both themes verified by screenshot.

## P24 — Light-mode rework: bone, not butter
Benchmarked against merciv.com: our cream #fdf6e3 read as high-chroma
butter next to their calm warm bone, and our borders/shadows were heavy
and yellow-tinted.
- **New light palette**: ground #f7f3ea (low-chroma warm bone), quieter
  hairlines (rgba ink at 0.08/0.16), neutral-warm card strokes, softer
  warm shadows. Gold and ink now do the talking instead of the ground.
- **Contrast verified programmatically**: every small-text token ≥4.5:1
  (AA) on bg, white and bg-2. Fixed real AA failures found in the pass:
  auth cross-links, wizard step labels and a styleguide label used raw
  --amber (~2.4:1) for small text — now --amber-text.
- **--amber-display**: deeper gold (#b57c07, 3:1 large-text AA) for the
  hero headline accent in light; dark keeps #ffc72c.
- **Hero halo**: soft amber radial layered over the dot grid (both
  themes, token-driven).
- Dark theme untouched. Gate green (74 unit, E2E, build).

## P25 — The Bellwood run: read the whole site, rank what's real, write like a person
A full run as a user on bellwoodcoffee.com (five Atlanta cafés on Shopify) came back
as a bean-and-grinder web store: the #1 pick was "burundi coffee beans" (110 searches a
month), matched to a $400 brewer, with an ad that opened "You are looking for El
Salvador coffee beans to brew at home." Every one of those is one bug, fixed here.
- **Crawl reach** (lib/import/website.ts): the 400 KB page cap cut a 578 KB Shopify
  homepage off before its first nav link, so the crawl read one page and found zero;
  now 2.5 MB. Anchor bodies wrapped in theme spans are read (800-char window). Policy,
  cart, careers and search pages can no longer outrank locations. **The sitemap is
  read** (`discoverSitemapPages`) — the menu and location pages the nav never links.
  Menu PDFs behind `?v=` cache-busters are found; "full" menus read first; four per
  site. A Square gift-card link is not "the menu". Storefront JSON is merged whenever
  the site is a storefront, not only when the crawl came back empty; menu items lead
  the confirm screen and duplicates across location menus fold into one row.
- **Ranking**: `matchService` weights shared words by rarity and ties break to the
  plainer name ("Drip Coffee", not "Fellow Aiden Coffee Brewer"); parenthetical
  qualifiers count for the match, not the size. A mostly-zero daily series is sparse,
  never "+100% across 30 days". Monthly volumes stamped under a Trends index key are
  filtered out before any read (`indexSeries`) — the ranking had computed
  "+1,417,664%". Month reads cap at +400%. A search volume under 300 a month is held
  to the B range and the rationale says why. Rerank writes reads for every pick; rank
  left the read fingerprint so the dashboard stops re-writing reads that exist.
- **Copy** (gemini-8): the system prompt now says what good looks like, with shape
  examples, not only what is banned; the slate is three real routes (the thing, the
  moment, the person); the judge has a read-aloud rubric; assets get five headline jobs
  and three primary-text openers; a **copy chief** pass rewrites lines that fail. The
  matched service is a starting point the model may override with a truer menu item.
  Prices are exact ($3.50, not $4) in reads and prompts. Reads (read-3) open on the
  deciding fact, never on "Run this small."
- Verified live: the test account's #1 is "coffee shop open late" in Georgia with the
  hook "An espresso martini in a room where you can actually hear your friends talk";
  the brief names Gold Rush at Peachtree, the Riverside evening bar and the Mini-ccino.
  Gate green: 44 unit files (392 tests), tsc, lint on touched files.

## P26 — Four signals, one call, and the DTC customer
Two founder briefs on 2026-09-12. First: TRND is a creative decision engine built from four
signals, each defined narrowly. Customer is the TARGET customer's signal, not every signal in
the category. Competitive is the direct competitor, and exactly what it advertises and how that
performs. Cultural is what the base scraper already does, weighted lowest. Brand is the products,
the customer data, and the brand's own ad history and performance. Second: the customer is now a
DTC brand spending $20K-$250K a month on paid social, at $500 a month, and the product answers
"Know what ad to run next."

- **Scoring** (lib/scoring.ts): customer 35%, brand 30%, competitive 25%, cultural 10%. A signal
  with no read is left out and the rest renormalize; unknown competition still scores just under
  neutral. Customer momentum is judged against the brief's named target customer (brief-7
  `target_customer`: who, triggers, their vocabulary, hangouts, objections). Brand is 70% menu fit
  and 30% proof, best evidence first: the brand's past ads on the term, then its own posts, then
  category learnings. Competitive reads the named direct rivals on the term, and ads still running
  after three weeks count harder. A short-form read reaches the customer signal at a quarter
  strength, because a +200% TikTok read with no search behind it outranked a +40% search rise.
- **Evidence** (lib/recommend/four-signals.ts, lib/intel/social-ingest.ts): Instagram, TikTok and
  Facebook posts for the brand and its direct rivals (Apify, refreshed at most every 48 hours);
  rivals' Meta Ad Library ads by Page with run length, and Google ads from the Ads Transparency
  Center; the brand's ad history from uploaded Ads Manager or Google Ads exports and from a
  connected Meta ad account (180 days, ad level, with each ad's copy).
- **Direct rivals**: a local business keeps its five nearest places, now ranked by how directly they
  compete (menu overlap, price band, distance) with a plain reason. An online brand gets competing
  brands proposed by Gemini and verified by their own site and live ads; marketplaces and dead
  domains are dropped.
- **The call** (lib/recommend/ad-call.ts): "Run this ad. Promote X to Y on Z. Angle. Format. Why.
  Here are 3 scripts to test." on the dashboard pick and at the top of the Monday report. Every
  clause traces to a number on the page, and a clause with nothing behind it is left out. It
  promotes what the written ad actually sells, not the scorer's menu match.
- **The writer** (gemini-9): told who the ad is for in their words and doubts, what the direct
  rivals are already saying (never echo it), what has worked for this brand, and the winning length.
- **DTC**: businesses carry `market` (online or local), a monthly ad spend band and ad platforms.
  Onboarding defaults to online for storefronts; online brands read demand nationally with no
  radius, city or weather. Copy, prompts, pricing ($500/month) and the landing page follow the
  positioning, with local wording kept for local businesses.
- **Shipping ahead of the migration**: 0022 is idempotent, and until it is pasted the Supabase repo
  drops columns production lacks and keeps writing. `scripts/probe-call.ts` prints the four-signal
  read and the call for a business without writing anything.

## P27 — Picks: the ad, the bet, and when to kill it
Founder spec, 2026-09-12: the pick page stopped at "here is an interesting trend"; it must end
at "here is the ad, here is the bet, here is when to kill it", and every element must change
what the brand shoots on Tuesday. The primary reader is the person making the creative.

- **Schema** (0023): `picks`, `pick_evidence`, `pick_scripts`, `pick_feedback`, `pick_runs`,
  RLS by business, and `replace_week_picks()`, which writes a week in one transaction, keeps
  picks someone ran or dismissed, and stores anything without three scripts and one evidence
  row as a draft.
- **Generation** (lib/picks): written upstream, never on a page. Code computes the one metric
  (week change, else 30 days; a short-form read under 5,000 views hands over to search, or the
  pick stays a draft), the sparkline, the bet sized from the brand's spend, a kill rule that is a
  threshold, and evidence by signal with sources that never restate the metric. The model writes
  the finding (the customer's words against the brand's, naming the item the bet runs, or what
  the page leads with when there is no word gap), what to run, a guardrail or null, and three
  scripts of 15 to 45 seconds; zod validates it, Pro then Flash, else a draft. Its own cron runs
  twenty minutes after ranking with a two-minute budget per invocation and hands the rest on.
- **Pages**: `/app/picks` is five ranked rows (finding, one metric, bet, run status) and replaces
  the carousel; `/app/picks/[id]` renders the finding, metric and sparkline, the bet, three
  script cards with copy, the guardrail only when there is one, collapsed evidence by signal, and
  a sticky footer to copy, export, run it (a run under Campaigns) or dismiss it with a reason.
  `/picks` and `/app` redirect. No composite scores, no narrative paragraph, no "no data" copy.
- **Found on real data**: a dry run on eskiin (`scripts/probe-picks.ts`, writes nothing) showed
  an H1 quoting the wrong product, "+200%" on 688 views, 60- and 8-second scripts, and a finding
  with no gap in it. Each is now a validation rule or a code path, with tests.
