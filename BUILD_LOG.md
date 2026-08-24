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
