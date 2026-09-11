# Go-live: what makes the signal thick

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
| 6 | Register a **Reddit script app** and move the adapter to OAuth | Free | Category-subreddit conversation reads; anonymous JSON now returns HTML from datacenter IPs. Small code change once the token exists. | (new) `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
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
