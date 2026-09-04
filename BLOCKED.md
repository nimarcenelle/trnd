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

## Meta ad-account connect / launch / results sync
- Needs a Meta developer app with Marketing API access. Until its keys exist, Settings
  shows the connect card as "awaiting platform credentials", launch stays copy-paste,
  and results stay manual entry.
- **Seam**: create an app at developers.facebook.com (type Business), add the Marketing
  API product, request `ads_read` + `ads_management` in App Review (business
  verification required for public use; app works immediately for admins/testers of the
  app). Set `META_APP_ID`, `META_APP_SECRET`, and `NEXT_PUBLIC_APP_URL` (the OAuth
  redirect is `<APP_URL>/api/connect/meta/callback` — add it to the app's Valid OAuth
  Redirect URIs). Everything else — connect button, paused launch, daily sync cron —
  activates on its own.

## Google Places (reviews & competitor ratings)
- **Seam**: a Google Cloud project with "Places API (New)" enabled; set
  `GOOGLE_PLACES_API_KEY`. Unlocks own-review mining (voice of customer) and daily
  competitor rating reads. ~$0 at SMB volumes (monthly free tier covers it).

## DataForSEO (search-volume backbone)
- **Seam**: an account at dataforseo.com; set `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`.
  Watch terms then get real monthly search volumes + deltas daily (~$0.05/1k keywords),
  replacing dependence on Google's fragile unofficial trends endpoint.

## Weekly email (Resend)
- **Seam**: a Resend account with a verified sending domain; set `RESEND_API_KEY` and
  `EMAIL_FROM`. The Monday report email + cron are already wired (`/api/cron/weekly-email`).

## Google Ads (second ad platform)
- OAuth client + developer-token config exists in `lib/env.ts`
  (`GOOGLE_ADS_CLIENT_ID/SECRET/DEVELOPER_TOKEN`) but no sync/launch implementation yet —
  Meta ships first; the Google Ads API requires a developer token application anyway.

## Website import (in this container only)
- Onboarding's "read your website" fetch is blocked by the sandbox egress policy, so
  here it always takes the graceful manual-entry path. The fetch + extractor
  (JSON-LD, title, price-line heuristics; Gemini refinement when keyed) are fully
  implemented and unit-tested against fixture HTML.
- **Seam**: none — works wherever the app has normal outbound network access.
