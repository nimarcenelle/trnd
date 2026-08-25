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
