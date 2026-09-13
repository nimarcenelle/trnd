# Go-live: what makes the signal thick

Everything below is a seam that already exists in code (see `BLOCKED.md` for the
mechanics). Each one needs an account, a key, or a review rather than a code change — with
one flagged exception, item 8, which needs a small adapter change once its token exists.

**Work it in this order.** The customer is a DTC brand spending $20K–$150K a month on paid
social, so the list is ordered by what that brand feels. Search volume (1) is the demand
backbone for every watch term, and the connected Meta ad account (2) is the whole back half
of the loop: launch, results, the Brand signal, and the only way to measure the results
guarantee. Item 2 is also the one with a calendar on it — App Review takes days to weeks,
so start it the day you start anything. Weather and Google Places are **local-path only**:
they do nothing for an online brand and sit at the bottom for that reason.

| # | Do this | Cost | What it switches on | Env |
|---|---|---|---|---|
| 1 | Create a **DataForSEO** account | ~$0.05 per 1k keywords; pennies a day | Real monthly search volume and week-over-week deltas for every watch term. This is the fix for "no weekly read yet": Google's unofficial Trends endpoint 403s from datacenter IPs and cannot be the backbone, and the demand score anchors Trends to real volume — without it, Trends contributes nothing. | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |
| 2 | Create a **Meta app** with Marketing API access and pass App Review | Free; days to weeks of review | The connected ad account: one-click launch (campaigns land paused in the brand's own account), results syncing daily, and the brand's own ad history read back into the Brand signal and the kill rule. Until then launch is paste-into-Ads-Manager and results are typed in by hand, which is where brands drop. Works immediately for admins/testers of the app, which is enough for the founding cohort. Request `ads_read` + `ads_management`; the OAuth redirect is `<APP_URL>/api/connect/meta/callback`. | `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_APP_URL` |
| 3 | Set the **Gemini** key in production | Cents per brand per week | The finding and the scripts on every pick, the written campaign, the founding analysis, Ask, standing questions, the Monday note. Without it every one of these is a template. | `GEMINI_API_KEY` |
| 4 | Buy an **Apify** token | Usage-priced, per result | The Competitive signal on a real server: the per-rival Meta Ad Library read (what each named rival is running, and how long it has been running), rival social reads, and per-term TikTok. The free Ad Library path renders the public page with Playwright, and Vercel has no browser — so on the deployed site this key is what makes Competitive more than a national board. | `APIFY_TOKEN` (+ `APIFY_*_ACTOR` overrides) |
| 5 | Set `CRON_SECRET` and confirm the Vercel crons fire | Free | Daily ingest, the daily rival read, the Monday ranking, the picks, the weekly email, the daily results sync. Nothing is evergreen if the crons don't run. | `CRON_SECRET` |
| 6 | Verify a sending domain on **Resend** | Free tier | The Monday brief actually leaves the building — the one touch that reaches a brand that didn't open the app. | `RESEND_API_KEY`, `EMAIL_FROM` |
| 7 | Create a **YouTube Data API** key | Free (10k units/day) | Shorts views per watch term, this week vs last, and the one video pulling the most — the short-form half of the Culture signal. Free, so there is no reason to skip it. | `YOUTUBE_API_KEY` |
| 8 | Register a **Reddit script app** and move the adapter to OAuth | Free | Customer-subreddit conversation reads; anonymous JSON now returns HTML from datacenter IPs. Small code change once the token exists. | (new) `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
| 9 | Enable **Places API (New)** on a Google Cloud project | Free tier covers this volume | **Local path only.** Own-review mining and daily rival ratings; "Find my nearest rivals" appears. An online brand's rivals are found by `lib/intel/discover-brands.ts` instead, and never touch Places. | `GOOGLE_PLACES_API_KEY` |

Weather needs nothing at all — Open-Meteo is keyless — and is skipped for every online
brand by `lib/signals/ingest.ts`. There is nothing to buy for it and nothing to wait on.

Items 1–4 make the product stop being thin for a DTC brand. Item 2 is what makes the ad
get launched and the results come back on their own. Items 5 and 6 make the week arrive
without anyone opening the app — which is the whole evergreen promise.

## What the code already does once those land

- Every watch term gets a measured week (1) and a short-form read (7).
- Launch creates the campaign **paused** in the brand's own Meta account, the daily cron
  pulls insights for every launched campaign, and the same run pulls the account's own ad
  history so the Brand signal and the kill rule read real numbers (`lib/ads/`).
- Each named rival's live ads are read daily, with how long each has been running — the
  strongest "this is working" evidence the Ad Library allows (`lib/signals/adlibrary-apify.ts`).
- Every pick carries what TRND remembers about it — weeks ranked, dismissals, the creative
  run on it and its results — into its finding, its evidence, and the Monday note
  (`lib/recommend/history.ts`).
- The brand's standing questions are re-answered every Monday with what moved since the
  last answer, and ride out in the mail (`lib/intel/standing.ts`).
- The week's picks are written before anyone opens the app, one stage per cron invocation
  (`lib/picks/advance-week.ts`).
