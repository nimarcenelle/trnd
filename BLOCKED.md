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
- **Seam**: create one recurring price ($149/mo; `STRIPE_PRICE_PRO` is read but no
  longer sold), fill `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_BASELINE`, and point a webhook at `/api/stripe/webhook` with
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
What each source can and can't give, verified live 2026-09-11:

- **YouTube Shorts** — `lib/signals/adapters/youtube.ts` reads each business's own watch
  terms over 28 days: this week's Shorts against a three-week baseline, with duration,
  likes, comments and channel captured for every video (`videos.list` costs the same 1
  unit whether you ask for one part or four). From that it reports median length,
  engagement rate, the channels working the format more than once, the top video and the
  fastest climber. Momentum is measured on VELOCITY (views per hour since publish), not
  raw views — a view-count-ordered search over 28 days returns mostly older videos, so a
  raw-total comparison makes every term look like it is falling.
  - Coverage is quota-bound: search.list is 100 units, videos.list is 1, against a free
    10,000/day. Reads are tiered — a business's own terms get a two-search deep read
    (28-day date-ordered sample for the unbiased baseline, plus 7-day view-ordered for
    the actual hit), stock category terms get the sample only — and every call is drawn
    against an explicit unit budget that degrades to fewer terms instead of 403ing.
  - **Seam**: create a YouTube Data API v3 key (Google Cloud console, free tier, no
    billing card) and set `YOUTUBE_API_KEY`. The adapter registers unavailable without
    it; nothing else changes. **Currently unset**, so the Shorts read contributes
    nothing — this is the single highest-value key in the file, and it is free.
  - **Seam for more coverage**: a YouTube quota increase is a Google Cloud form, not a
    payment; TERM_CAP and the unit budget are the two constants to raise after.
- **TikTok (free, national)** — `lib/signals/adapters/tiktok-cc.ts` reads the public
  Creative Center trending-hashtag boards, keyless. Anonymous access is capped at the
  **top 3 rows per query with no paging** (page 2 comes back empty), so the run asks each
  mapped industry for both the 7-day and 30-day board: ~40 national hashtags a day. The
  per-hashtag detail endpoint answers `InvalidLogin`, and the newer `creative_radar_api`
  endpoints answer `no permission` without a signed web token — all re-verified live
  2026-09-11. So there is **no per-term TikTok read on this surface** at any price of
  effort. TikTok board reads are national industry trends and the UI says so; local
  demand is confirmed by the search read, never by the board.
  - The boards rank whatever is nationally loud among an industry's advertisers, which
    during a holiday week is just the holiday: on 2026-09-11 the Food & Beverage board
    was `#happylaborday`, `#ldw`, `#laborday2026`. Two guards handle that. Variant
    spellings of one trend are collapsed so they cannot eat three of the ~40 daily slots,
    and every row is marked on- or off-topic for the industry it was filed under by the
    same Gemini pass that humanizes the slug — the model sees the board's industry, which
    the term lexicon alone cannot judge (it marked `#sorority recruitment outfits` on the
    Home Improvement board on-topic while missing `#leaf blower maintenance`). Off-topic
    rows are kept and framed as a national moment to time an offer to, not dropped.
- **TikTok (paid, per term)** — `lib/signals/adapters/tiktok-apify.ts`, key-gated on
  `APIFY_TOKEN`. Runs a commercial Apify actor per business watch term and produces the
  same shaped read as the Shorts adapter (velocity momentum, engagement, median duration,
  top + breakout, corpus) plus two things YouTube has no equivalent for: shares + saves
  as their own rate, and the author's follower count, which is how you tell a format that
  worked from an audience that was already there.
  - **Cost is per result, not per call** — every term read is money, so coverage is
    bounded by an explicit term cap (25) and only a business's own terms are read; the
    stock category terms stay on the free board.
  - **Unverified**: the pure mapping and read logic are unit-tested, but the network path
    has never run — there is no `APIFY_TOKEN` on this machine. Actor field names drift,
    so confirm `playCount`/`diggCount`/`collectCount`/`authorMeta.fans` against a real
    run before trusting the first night's numbers. `APIFY_TIKTOK_ACTOR` overrides the
    default actor when it gets renamed.
- **X** — `lib/signals/adapters/x.ts`, key-gated on `X_BEARER_TOKEN`. Recent search
  reaches back seven days on every tier, so the read compares the halves of that
  window and reports no delta rather than inventing one. **Verified live 2026-09-12:
  a token on the free tier answers every search endpoint with `402 credits
  depleted`** — the free tier carries no read credits at all, and `search/recent` +
  `counts/recent` are Basic ($200/mo) or above. The adapter treats 401/402/403 as an
  entitlement failure and stops for the run rather than repeating the refusal once
  per term.
  - **Seam**: a paid X tier. Nothing else is missing; the adapter runs the moment the
    key has credits.
- **Toast (and any Cloudflare-fronted ordering platform)** — **there is no server-side
  read.** Verified live 2026-09-12 on caffedriade.com: the site links
  `toasttab.com/caffedriade`, which 301s to `order.toasttab.com/online/...` and returns
  a Cloudflare interstitial (`<title>Just a moment...</title>`), while
  `ws-api.toasttab.com/restaurants/v1/...` answers `401 unauthorized`. The business's
  own site states no price anywhere and its reviews mention none. So for a Toast
  restaurant the prices can only come from the owner, which is what the onboarding
  handover and the Settings upload are for — and the pick screen's ANCHOR slot now says
  so plainly instead of reciting positioning prose.
- **Instagram Reels** — still no keyless path. The Graph API's `ig_hashtag_search` +
  `{hashtag-id}/recent_media` gives per-hashtag Reels volume, but needs an Instagram
  Business account linked to a Facebook Page and App Review for `instagram_basic`
  (30 unique hashtags per 7 days). The Meta app already exists for ad-account connect
  (`lib/ads/meta.ts`), and the scopes are now wired but **deliberately dark**:
  `META_SCOPES` adds `instagram_basic` + `pages_show_list` only when
  `META_INSTAGRAM_SCOPES=1`, because requesting a scope Meta has not approved degrades
  the consent screen for the ad connect that already works.
  - **Seam**: pass App Review, set `META_INSTAGRAM_SCOPES=1`, then write the adapter
    against the same `ShortsRead` shape the other two share. **The adapter now exists**
    (`lib/signals/adapters/instagram.ts`), key-gated on `INSTAGRAM_ACCESS_TOKEN` +
    `INSTAGRAM_BUSINESS_ID`; only App Review and the scope flag are outstanding.
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

## Four-signal reads (2026-09-12)

What the customer, competitive, cultural and brand signals need that code cannot supply.

- **Migration 0022** (`supabase/migrations/0022_four_signals.sql`): social handles, market,
  ad spend and platforms on businesses; directness and handles on competitors; the target
  customer on briefs; the `social_posts` and `ad_history` tables; `social` and `google_ads`
  competitor-read kinds. Paste it into the Supabase SQL editor. Until it runs, writes drop
  the missing columns and keep working (lib/db/supabase/repo.ts `writeTolerant`), and posts
  and ad history are simply not kept.
- **`APIFY_TOKEN`**: the Instagram, TikTok and Facebook account reads (lib/social/*) and the
  direct rivals' Meta Ad Library read by Page (lib/signals/adlibrary-apify.ts). Without it the
  social half of the brand and competitive signals is empty and rival Meta ads fall back to the
  Playwright keyword scrape, which does not run in serverless prod. Actor overrides:
  `APIFY_INSTAGRAM_ACTOR`, `APIFY_FACEBOOK_ACTOR`, `APIFY_ADLIBRARY_ACTOR`,
  `APIFY_GOOGLE_ADS_ACTOR` (the Google Ads Transparency read uses the renderer when unset).
  Cost is per result: accounts refresh at most every 48 hours, and only direct rivals are read.
- **Stripe price for $500/month** (and $5,000/year): the DTC positioning replaces $149/$299.
  Set `STRIPE_PRICE_BASELINE` to the new price id.
- **Meta ad account history**: syncing every ad a brand ran needs the existing `ads_read`
  scope through App Review for accounts outside the app's testers.

## Picks rebuild (2026-09-12)

- **Migration 0023** (`supabase/migrations/0023_picks.sql`): the `picks`, `pick_evidence`,
  `pick_scripts`, `pick_feedback` and `pick_runs` tables with RLS, and the
  `replace_week_picks()` function the weekly job writes through. Paste it into the Supabase
  SQL editor before deploying the picks pages; it is idempotent. Until it runs, the list reads
  as empty (the repo treats missing tables as no rows) and the weekly job's write fails and is
  logged, so no picks appear.
