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
