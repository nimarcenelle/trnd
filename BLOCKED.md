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

## Short-form social (the basis of the ranking)

TRND ranks on what's moving in short-form video, with search volume as confirmation.
What each source can and can't give, verified live 2026-09-10:

- **YouTube Shorts** — `lib/signals/adapters/youtube.ts` reads each business's own watch
  terms: Shorts published in the last 14 days, this week's views against last week's,
  plus the single Short pulling the most (linked from the badge so the owner can watch
  the format that's landing). Costs ~101 quota units per term (search 100 + videos 1),
  capped at 40 terms a run against the free 10,000/day.
  - **Seam**: create a YouTube Data API v3 key (Google Cloud console, free tier, no
    billing card) and set `YOUTUBE_API_KEY`. The adapter registers unavailable without
    it; nothing else changes.
- **TikTok** — `lib/signals/adapters/tiktok-cc.ts` reads the public Creative Center
  trending-hashtag boards, keyless. Anonymous access is capped at the **top 3 rows per
  query with no paging** (page 2 comes back empty), so the run asks each mapped industry
  for both the 7-day and 30-day board: ~40 national hashtags a day. The per-hashtag
  detail endpoint answers `InvalidLogin`, and the newer `creative_radar_api` endpoints
  answer `no permission` without a signed web token — so there is **no per-term TikTok
  read** at any price of effort here. TikTok reads are national industry trends and the
  UI says so; local demand is confirmed by the search read, never by the board.
  - **Seam for per-term TikTok**: either TikTok's Display/Research API (app review,
    academic-gated) or a commercial scraper API (e.g. Apify TikTok actors) with a token
    and per-run cost.
- **Instagram Reels** — no keyless path. The Graph API's `ig_hashtag_search` +
  `{hashtag-id}/recent_media` gives per-hashtag Reels volume, but needs an Instagram
  Business account linked to a Facebook Page and App Review for `instagram_basic`
  (30 unique hashtags per 7 days). The Meta app already exists for ad-account connect
  (`lib/ads/meta.ts`, scopes `ads_read`/`ads_management`/`business_management`), so the
  seam is adding `instagram_basic` + `pages_show_list` to `META_SCOPES`, passing review,
  and writing the adapter. Nothing is implemented for it yet.
- **Reddit** — `lib/signals/adapters/reddit.ts` uses anonymous JSON, which now returns
  the HTML page instead of JSON for datacenter IPs (verified). Assume it contributes
  nothing in production until it's moved to a registered script app + OAuth token.

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
