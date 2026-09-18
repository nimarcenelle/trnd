# Go-live: what makes the signal thick

## Close the loop first (2026-09-17)

The four things that turn a research tool into the learning system the positioning
promises, in order. Three cost nothing but a review cycle and some config; the code for
every one of them is in place and tested.

| # | Do this | Cost | What it switches on |
|---|---|---|---|
| 1 | **Meta App Review for `ads_read`** (the app, the one scope, and Meta's deauthorize and data-deletion callbacks are wired; review is what lets accounts outside the app's testers grant it; the submission is written out below) | Free; days to weeks | 180 days of ad-level results with creative copy, no upload (`lib/ads/history-sync.ts`), and every test named the way its brief says (`TRND: <concept title>`) gets its numbers from that history daily and goes live on first delivery (`lib/ads/run-sync.ts`). Brand stops being the dark 25% lane. |
| 2 | **Require an export at pilot onboarding** (process, not code: the upload step is on the Context screen and in Settings) | Free | Week one starts from a real baseline: every brief is graded against the brand's own ads of that shape ("2 of your last 3 ads built on explaining something beat your account click-through"), and the evaluation plan names the account's own cost per result. |
| 3 | **Set `YOUTUBE_API_KEY`** (Google Cloud console, free tier, no card) | Free, 10,000 units a day | The Shorts read per watch term. Currently unset, so the short-form half of the demand read runs on the TikTok board alone. Settings names only the reads that run, so this shows up the day it is set. |
| 4 | **Create the Reddit script app** and set `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Free | The adapter is already on OAuth; without the app it reads nothing from a cloud IP. |
| 5 | **Verify the per-term TikTok actor on one live run**: `APIFY_TOKEN=... pnpm tsx scripts/probe-tiktok-apify.ts "shower filter"` | One paid run, a few cents | The probe prints which documented fields arrived and exits non-zero if a required one did not. The adapter now warns once per night when the actor drifts, and every run is metered. ~$4 per 25-term read. |
| 6 | **Paste migration 0029** (`supabase/migrations/0029_calibration.sql`) | Free | The calibration log: baseline click-through and lift on every finished run, read back as Predicted against actual on the Track record. Until it runs, writes drop the two columns and everything else still lands. |
| 7 | **Paste migration 0032** (`supabase/migrations/0032_connection_provider_user.sql`) | Free | The Meta login behind each connection, which is how a deauthorize or data-deletion request from Meta finds the row. Until it runs, connects still land (the column is dropped from the write) and the callbacks find nothing to act on. |

## Meta App Review: the submission (2026-09-18)

The pilot does not need this. An app in Development mode works for anyone with a role on
it: add each pilot brand's Facebook user as a **Tester** under App roles, they accept from
their developer notifications, and Connect Meta in Settings works that day. Review is what
lets a brand with no role on the app connect, which is the public product.

**Before submitting, in the app dashboard.** Start business verification first; it is its own
review and the slowest part.

| Where | Set to |
|---|---|
| App settings → Basic → Privacy policy URL | `https://usetrnd.com/privacy` |
| App settings → Basic → Terms of service URL | `https://usetrnd.com/terms` |
| App settings → Basic → Data deletion → Data deletion request callback URL | `https://usetrnd.com/api/connect/meta/data-deletion` |
| App settings → Basic → App icon, category, contact email | Icon 1024×1024; category Business and pages |
| App settings → Advanced → Deauthorize callback URL | `https://usetrnd.com/api/connect/meta/deauthorize` |
| Facebook Login → Settings → Valid OAuth redirect URIs | `https://usetrnd.com/api/connect/meta/callback` |
| App settings → Verification → Business verification | Legal name, address, one document (licence, utility bill, bank statement) |

The three callback URLs are real endpoints: the redirect finishes the connect, the
deauthorize marks the connection revoked the moment a person removes TRND on Facebook, and
the data-deletion one deletes the connection and everything it synced and answers Meta with
the confirmation code and status page it requires (`lib/ads/meta-callbacks.ts`). Replace
the host with `NEXT_PUBLIC_APP_URL` if it is not usetrnd.com.

**The request.** App Review → Permissions and features → `ads_read` → Request Advanced
Access. Nothing else: the connect asks for exactly this one scope, and the callback refuses
a connect that did not grant it, so the screencast and the consent screen match.

Use-case text, as written:

> TRND writes weekly creative test briefs for small advertisers and grades them against the
> advertiser's own ad history. With ads_read, TRND reads the connected ad account's ad-level
> results (spend, impressions, link clicks, purchases or leads, and the ad's headline and
> primary text) for the last 180 days, once a day. It uses them for two things only: to grade
> each new brief against what that account's past ads of the same shape did, and to attach
> results to the tests the advertiser ran, matched by the ad name the brief told them to
> use. TRND never creates, edits, pauses or launches an ad, never changes a budget, and reads
> nothing about people: no audiences, no messages, no Page content. The advertiser can
> disconnect in Settings, which deletes the token, or remove the app on Facebook, which
> revokes it and can trigger deletion of everything synced.

**The screencast**, under five minutes, on the production app, no cuts inside a step:

1. Sign in to the reviewer's TRND account (below).
2. Settings → Integrations → Connect Meta. Show the Meta consent screen with `ads_read` on
   it, allow, and land back on Settings reading "Connected".
3. Settings → Your past ads: the row count from the synced account (it fills within a minute
   of connecting; wait on camera or cut to it and say so).
4. What to make next → open one brief → scroll to "Your own record on this shape" (the
   lineage line built from the synced ads) and the "Name it" row.
5. Campaigns: a launched test whose spend, impressions and click-through are already on
   its row, found in the account under the name its brief gave it (the daily sync fills
   them; run `POST /api/cron/sync-results` with the cron secret before recording so the
   row is filled on camera).
6. Settings → Integrations → Disconnect, and the card reading "Ready to connect" again.

**The test login.** Create a TRND account for the reviewer on production with a business
already set up (any real category, Atlanta is fine), put its email and password in the
submission notes, and connect it to a Meta test user or a real ad account you control that
has delivery in the last 180 days. Reviewers reproduce the screencast themselves; an
account with nothing to sync gets rejected as "could not verify the use case".

**Data Use Checkup** (asked at submission and yearly): data is used only to provide the
features above to the business that connected the account; stored in Supabase; not sold,
not shared, not used for anything else; deleted on disconnect, on the platform's deletion
request, or with the account.

After approval, switch the app from Development to **Live** (top of the dashboard). Until
it is Live, a person without a role on the app cannot connect at all.

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
| 7 | Create a **Meta app** with Marketing API access and pass App Review for `ads_read` | Free; days to weeks of review | The connected account's own ad history syncs daily and tests get their results by name. TRND never launches an ad. Works immediately for admins/testers of the app, which is enough for a three-brand pilot. | `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_APP_URL` |
| 8 | Set `CRON_SECRET` and confirm the Vercel crons fire | Free | Daily ingest, intel and ranking, the Monday picks and email, the daily results sync. Nothing is weekly if the crons don't run. | `CRON_SECRET` |

Items 1–4 make the product stop being thin. Item 7 closes the loop without an upload.
Items 5 and 8 make it arrive on its own — which is the whole weekly promise.

## What the code already does once those land

- Every watch term gets a measured week (1) and a short-form read (2) in its own metro.
- Every brief is graded against the brand's last ads of the same shape, and every finished
  test logs its lift over the account for the Track record (`lib/record/calibration.ts`).
- The Monday email carries the week's tests and the tests still waiting on results
  (`lib/email/weekly-briefs.ts`).

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
