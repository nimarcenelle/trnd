# Go-live: what makes the signal thick

## Close the loop first (2026-09-17)

The four things that turn a research tool into the learning system the positioning
promises, in order. Three cost nothing but a review cycle and some config; the code for
every one of them is in place and tested.

| # | Do this | Cost | What it switches on |
|---|---|---|---|
| 1 | **Meta App Review for `ads_read`** (the app and the scope are already wired; review is what lets accounts outside the app's testers grant it) | Free; days to weeks | 180 days of ad-level results with creative copy, no upload (`lib/ads/history-sync.ts`), and the daily sync writing every launched campaign's numbers onto the creative test it came from: the run goes live when the platform delivers, closes when the platform says it ended, lands in the brand's ad history, and logs its lift over the account (`lib/ads/run-sync.ts`). Brand stops being the dark 25% lane. |
| 2 | **Require an export at pilot onboarding** (process, not code: the upload step is on the Context screen and in Settings) | Free | Week one starts from a real baseline: every brief is graded against the brand's own ads of that shape ("2 of your last 3 ads built on explaining something beat your account click-through"), and the evaluation plan names the account's own cost per result. |
| 3 | **Set `YOUTUBE_API_KEY`** (Google Cloud console, free tier, no card) | Free, 10,000 units a day | The Shorts read per watch term. Currently unset, so the short-form half of the demand read runs on the TikTok board alone. Settings names only the reads that run, so this shows up the day it is set. |
| 4 | **Create the Reddit script app** and set `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Free | The adapter is already on OAuth; without the app it reads nothing from a cloud IP. |
| 5 | **Verify the per-term TikTok actor on one live run**: `APIFY_TOKEN=... pnpm tsx scripts/probe-tiktok-apify.ts "shower filter"` | One paid run, a few cents | The probe prints which documented fields arrived and exits non-zero if a required one did not. The adapter now warns once per night when the actor drifts, and every run is metered. ~$4 per 25-term read. |
| 6 | **Paste migration 0029** (`supabase/migrations/0029_calibration.sql`) | Free | The calibration log: baseline click-through and lift on every finished run, read back as Predicted against actual on the Track record. Until it runs, writes drop the two columns and everything else still lands. |

## Keys and accounts

Everything below is a seam that already exists in code (see `BLOCKED.md` for the
mechanics). Nothing here needs a code change — it needs an account, a key, or a review.
In the order it changes what an owner sees:

| # | Do this | Cost | What it switches on | Env |
|---|---|---|---|---|
| 1 | Create a **DataForSEO** account | ~$0.05 per 1k keywords; pennies a day | Real monthly search volume and week-over-week deltas for every watch term, per metro. This is the fix for "no weekly read yet": Google's unofficial Trends endpoint 403s from datacenter IPs and cannot be the backbone. | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |
| 2 | Create a **YouTube Data API** key | Free (10k units/day) | Shorts views per watch term, this week vs last, and the one video pulling the most. The short-form half of the ranking. | `YOUTUBE_API_KEY` |
| 3 | Enable **Places API (New)** on a Google Cloud project | Free tier covers SMB volume | Own-review mining (customer voice in the copy) and daily rival ratings; "Find my nearest rivals" appears. | `GOOGLE_PLACES_API_KEY` |
| 4 | Set the **Gemini** key in production | Cents per business per week | The read on every pick, the written-for-you ad, the founding analysis, Ask, standing questions, the Monday note. Without it every one of these is a template. | `GEMINI_API_KEY` |
| 5 | Verify a sending domain on **Resend** | Free tier | The Monday email actually leaves the building. | `RESEND_API_KEY`, `EMAIL_FROM` |
| 6 | Register a **Reddit script app** | Free | Category-subreddit and per-term conversation reads; anonymous JSON returns HTML from datacenter IPs. The adapter is already on OAuth; only the two env vars are missing. | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
| 7 | Create a **Meta app** with Marketing API access and pass App Review | Free; days to weeks of review | One-click launch, paused campaigns landing in the owner's ad account, results syncing daily. Until then launch is paste-into-Ads-Manager, which is where owners drop. Works immediately for admins/testers of the app, which is enough for a five-business pilot. | `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_APP_URL` |
| 8 | Set `CRON_SECRET` and confirm the Vercel crons fire | Free | Daily ingest, the Monday ranking, the auto-built ad, standing-question answers, the email. Nothing is evergreen if the crons don't run. | `CRON_SECRET` |

Items 1–4 make the product stop being thin. Item 7 is what makes the ad get launched.
Items 5 and 8 make it arrive on its own — which is the whole evergreen promise.

## What the code already does once those land

- Every watch term gets a measured week (1) and a short-form read (2) in its own metro.
- Every pick carries what TRND remembers about it — weeks ranked, passes, the last ad's
  results — into its read, its Ask box, and the Monday note (`lib/recommend/history.ts`).
- The owner's standing questions are re-answered every Monday with what moved since the
  last answer, in the app and in the mail (`lib/intel/standing.ts`).
- The week's ad is written before anyone opens the app (`lib/campaigns/auto.ts`).

## Running three paid pilots (2026-09-15)

1. Paste migration 0028 into the Supabase SQL editor. Set `PILOT_INVITE_CODE` and
   `ADMIN_EMAILS`. Confirm `NOTIFY_WEBHOOK_URL` or Resend so applications reach you.
2. Before inviting anyone, sign up a test brand yourself with a real Ads Manager export and
   read all three briefs. Fix what reads wrong; `scripts/probe-picks.ts` still dry-runs a week.
3. Accept three applicants who run Meta ads, make creative regularly, have a creator, and
   will share an export. **The export is a condition of the invite, not a request**: send
   the invite code only once the ad-level Ads Manager export (last 90 to 180 days) is in
   hand, with product facts and claims notes and what they shot last. A pilot week without
   it is research only, and the brief's own-history lineage, baseline and evaluation plan
   all read as missing. If the brand connects Meta and `ads_read` is approved, the export is
   pulled instead of uploaded.
4. Week one: read each brief before the brand does (the pilot promises this), refine in the
   app where it is wrong, and note what you changed by hand; that list is the next fix.
5. Ask each brand to choose, mark launched, and record results and what they learned on
   Campaigns. Read `/api/admin/probe?what=usage&business=<id>` weekly for what each brand's
   week cost in model tokens and estimated provider spend.
6. At the end of the month ask the only question that matters: will you pay for month two?
   Three yeses, three noes and the reasons decide what to build next.
