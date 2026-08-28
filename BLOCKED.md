# BLOCKED

Integrations that could not go live in this environment, per Overnight Protocol §3.2.
Each is implemented behind its interface and registered unavailable at runtime.

## Gemini API key
- The brief points at the GRWM repo for the key. The repo was cloned, but this session's
  permission classifier denies grepping repositories for API-key material (twice).
- **Seam**: put the key in `.env.local` as `GEMINI_API_KEY=` — nothing else changes.
  `lib/ai/gemini.ts` detects it at startup; without it the deterministic template
  generator in `lib/ai/fallback.ts` produces campaign JSON so every downstream screen works.

## Supabase (database + auth)
- No `NEXT_PUBLIC_SUPABASE_URL`/keys in the environment; `supabase start` impossible —
  Docker CLI exists but no daemon socket in this container.
- **Seam**: create a Supabase project, `supabase db push` (or run the SQL in
  `supabase/migrations/` in order), fill the three env vars. `lib/db` switches from the
  demo store to Supabase automatically; auth switches from the demo cookie session to
  Supabase Auth.

## Live signal sources (in this container only)
- Egress policy 403s trends.google.com, reddit.com, news.google.com (verified via the
  agent proxy log). Adapters are fully implemented with timeout/retry/circuit-breaker and
  fixture-based unit tests; the ingest job degrades to partial results per the brief.
- **Seam**: none needed — run `pnpm job:ingest` from any machine with normal egress.

## Stripe billing
- No Stripe keys in this environment, so checkout/portal/webhook are implemented but
  dormant: plan state tracks a 14-day trial from day one, and nothing ever locks while
  billing is unconfigured (an install with no way to pay must not brick itself).
- **Seam**: create two recurring prices ($49 baseline, $149 pro), fill
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASELINE`,
  `STRIPE_PRICE_PRO`, and point a webhook at `/api/stripe/webhook` with
  `checkout.session.completed` + `customer.subscription.updated/deleted`. Settings →
  Billing goes live and trial expiry starts gating new campaign builds.

## Vercel deploy
- No Vercel credentials; config is present (`vercel.json` with cron schedules) but no
  deploy was attempted, per the brief.

## Website import (in this container only)
- Onboarding's "read your website" fetch is blocked by the sandbox egress policy, so
  here it always takes the graceful manual-entry path. The fetch + extractor
  (JSON-LD, title, price-line heuristics; Gemini refinement when keyed) are fully
  implemented and unit-tested against fixture HTML.
- **Seam**: none — works wherever the app has normal outbound network access.
