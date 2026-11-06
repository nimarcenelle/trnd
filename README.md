# TRND for creators

Tells a TikTok creator exactly what to post next. TRND reads the creator's public videos, finds the creators a step ahead of them and
what is rising in their niche, and writes a weekly plan: three videos to make, each with the hook, a script second by
second, length, sound, when to post, caption and hashtags, and the evidence it rests on. An idea the creator adds to
their week is matched to the video they post and checked 48 hours later against their usual views.

What TikTok data is available, from where, and what is not: `DATA.md`.

## Onboarding (landing → paid)

Built from a study of comparable tools (`DATA.md` covers the data side). The rule: show real value before asking for
anything, then ask for one thing at a time.

1. **First screen** (`/`): "Make every post go viral." and the handle, nothing else; visitors come from an ad or a
   post. The read then runs one question a screen (`/start/[id]`) and ends on the diagnosis: how many of their videos
   never got past their followers, the gap to the creators ahead, their worst video, with what's killing their posts
   (the plan's `killer` and `problems`) locked until they pay. How it works, examples (invented accounts in
   `components/sample/lena.ts`), pricing and the FAQ are at `/pricing`.
2. **Free preview** (`/start/[id]`, `lib/preview/`): reads the profile, asks "Is this you?", then reads the niche and
   writes the plan while asking one optional question (the goal). Shows the numbers, creators ahead of them, what's
   rising, and **idea 1 in full**; ideas 2 and 3 show their hooks only. One step per request (`/api/preview/[id]/step`),
   so nothing outruns a function. Reused per handle for 72 hours; 3 new previews per visitor (hashed IP) a day and a
   daily budget for all (`PREVIEW_DAILY_CAP`); past it, visitors go to sign-up. Optional Turnstile bot check.
3. **Sign-up** (`/signup`): Continue with Google, or an emailed 6-digit code. No password. The preview is claimed into
   the new account (`lib/creators/create.ts`), so the app opens on the plan at once.
4. **Welcome** (`/app/welcome`): two one-tap steps (goal; how they film and how often), up to three creators they
   want to be like, then the **trial**: a timeline
   (today / reminder two days before / first charge), monthly first at "$5.77/week", weekly beside it, "Not now".
5. **Trial**: Stripe Checkout with a 14-day trial and a card (`TRIAL_REQUIRES_CARD=0` for no card). Stripe's
   `trial_will_end` sends our reminder email. Without a trial an account keeps its free plan (idea 1) and gets no
   daily reads.

## How it works

1. **Setup** (`/app/setup`). The creator enters their handle. The first scan starts at once; while it runs they set
   their goal (grow followers, comments, views, brand deals, sales), posts per week and a target.
2. **Scan** (`lib/creators/scan.ts`), in six stages, each saved so a scan cut short resumes where it stopped. Each
   stage makes at most one slow call (an Apify read or a model call, both bounded near two minutes), and a stage that
   would start more than 60s into a function goes to a fresh one (`/api/cron/scan?creator=…&resume=1`), so nothing
   outruns the 300s limit. Without `CRON_SECRET` the scan simply carries on in the same function.
   - **profile**: the creator's last 30 videos and account numbers (`lib/tiktok/read.ts`, Apify). Once a week the
     model reads the account (`readAccount`, `lib/ai/creators.ts`): niche, audience, what works, what doesn't, style,
     and the niche hashtags to watch. A connected account's numbers come from TikTok itself (`lib/tiktok/connect.ts`).
   - **niche**: recent videos under the niche hashtags. The creators to benchmark against are picked from those: not
     equals but accounts a step or two ahead in the same niche, two to fifty times their followers (5K to 250K for small
     accounts), best niche fit first, then the closest to five times their size (`rankPeers`, `aheadBand`). Too few
     ahead in the sample and the list is topped up from around their size, biggest first (`nearBand`). Creators the
     owner names ("Who do you want to be like?" in welcome, or Settings) always stay and come first. Matched creators
     with nothing in the last 21 days are replaced by ones still posting. A peer the owner
     removed is never matched again.
   - **peers**: each peer's last 15 videos.
   - **trends**: every hashtag and borrowed sound in the last 14 days of videos read, counted this week against last
     and staged early, rising, peaking or fading (`trendRows`, `stageOf`), snapshotted daily.
   - **tag**: when a plan is due (weekly, or on "Read again now"), up to 60 videos not yet read: the words said, from
     TikTok's captions (`readSpoken`), and the format and subject from the model. Creators the owner picked go first.
     Only words a video really says are shown in quotation marks (`videoLead`).
   - **plan**: ideas posted since the last scan are matched (`matchIdea`) and checked after 48 hours (`outcomeOf`);
     one with no numbers waits rather than getting a made-up verdict. When due, the plan is written from the
     creator's breakouts, peer videos ranked by **borrow score** (half the seats held for creators the owner picked,
     `pickBorrow`) and the early or rising trends. A source the model
     names must be one it was given, of the kind the idea claims, or it is dropped.
3. **The weekly rhythm** (`lib/creators/schedule.ts`): every creator's plan drops Tuesday 8 AM in their own timezone
   (from their browser, `creators.timezone`), so it becomes a habit. Vercel Cron hits `/api/cron/scan` **hourly**: a
   paid account is read daily and again at its plan slot, a free account only at its slot (`readDue`). Each 48-hour check
   is emailed as a scorecard that ends with the next plan's first hook (`sendScorecardEmail`), and the app header counts
   the weeks in a row with an idea posted (`streakOf`). Hourly crons need Vercel Pro. Vercel Cron fans out one
   invocation per due creator, always through
   `NEXT_PUBLIC_SITE_URL` (Vercel Cron calls the deployment's `*.vercel.app` address, which Vercel's login wall
   redirects). A new weekly plan is emailed, with a one-click unsubscribe (`/unsubscribe`, `email_plans`); a plan asked
   for with "Read again now" (once a day) is not. A read that fails keeps its stage and resumes there within 6 hours,
   shows the creator a plain message (`friendlyScanError`), and an account that keeps failing is tried less often, up to
   once a week (`scan_failures`, `lib/creators/guards.ts`). When reads are failing, stuck or not starting, the cron
   emails a summary to `ALERT_EMAIL` (default hello@usetrnd.com, `lib/ops.ts`).
4. **Settings** has the weekly email on/off and **Delete my account** (`lib/creators/delete.ts`): the Stripe
   subscription is cancelled first, the TikTok connection revoked, then the user is deleted and everything cascades.

**The numbers** (`lib/creators/stats.ts`) use public counts only. A creator's "usual" is the median and middle half of
the views of their settled videos (48 hours or older). "×" is a video's views over its creator's median. The borrow score
(0-100) blends how far a peer's video beat its own creator's usual (45%), shared niche hashtags (25%), freshness (15%) and
saves per 1K views against that creator's usual (15%).

## Distribution

- **Share card and referrals**: every weekly plan ends with "Share your next 3 posts": a 1080×1920 card of the week's
  hooks (`/app/plan-card`, `lib/preview/plan-card.tsx`) with the creator's referral link on it (`/join/<code>`,
  `lib/referrals.ts`). Whoever signs up through it gets a 30-day free month on their first checkout; once their
  subscription goes active, the referrer gets a free month: a 100%-off month on their subscription when they pay and
  `STRIPE_COUPON_FREE_MONTH` is set, else a credit (`creators.free_months`) used on their next checkout.
- **Public reads**: `/creators/@handle` shows the free-tier read of any handle previewed in the last 30 days (numbers,
  the gap, creators ahead, what's rising, the first idea's hook and why it works; never the script), indexable and in the
  sitemap, with "Claim @handle" and a way to ask for the page to come down. Its headline is TRND's own content format:
  "We ran @handle through TRND. Here's what it told them to post."

## Funnel numbers

`/admin` (emails in `ADMIN_EMAILS`) shows the brief's metrics from the `events` table (`lib/events.ts`,
`lib/metrics.ts`): free handle → account, account → first plan viewed, first plan → paid by tier, monthly/yearly mix,
week-2 and week-4 plan opens, scorecard opens, share cards per handle previewed, and churn by plan.

## Setup

```
pnpm install
cp .env.example .env.local   # Supabase, OpenAI and APIFY_TOKEN at minimum
pnpm dev
```

This is its own product: give it a new Supabase project and paste `supabase/setup.sql` into its SQL editor (safe to
re-run; an existing project takes the newer files in `supabase/migrations/` instead). It creates `creators`, `peers`, `videos`, `video_snapshots`, `follower_snapshots`, `trend_snapshots`, `plans`,
`idea_runs` and `tiktok_connections`, with owner-read RLS on all but the last (tokens are service-role only). Every
list read pages past PostgREST's 1,000-row cap (`lib/db/rows.ts`).

**Billing** (`lib/billing`): Free (no card: the numbers, the creators ahead, what's rising, one scripted idea a week,
read weekly), Creator ($19/month or $149/year, `STRIPE_PRICE_CREATOR_MONTHLY` / `_YEARLY`), and Pro ($49/$390) and
Business ($129/$990), which show their prices but take a waitlist (`waitlist`) until their features ship. Yearly is the
default on every pricing surface. The webhook records the plan as `creators.plan` (`creator_month`, `creator_year`);
subscribers on the old `weekly`/`monthly` prices keep them and count as Creator. No trial by default
(`CREATOR_TRIAL_DAYS` turns one on); paid plans carry a 14-day refund. One-time add-ons (script pack $19, done-for-you
month $79) are Stripe payments recorded in `addon_orders` and made by hand: the webhook emails `ALERT_EMAIL`.

**Connect TikTok** is optional and needs a TikTok developer app with Login Kit (`user.info.basic`,
`user.info.profile`, `user.info.stats`, `video.list`), redirect URI `<site>/api/tiktok/callback`, and TikTok's app review
before anyone but the sandbox's test users can connect.

## Layout

```
app/                 landing, auth, /app (plan + tabs, setup, creators/[handle], settings), api/cron/scan, api/tiktok, api/stripe/webhook
components/app/      idea card, the tab views, forms
components/sample/   the landing page's example plan (an invented creator)
lib/tiktok/          read (Apify, pure mappers + network), connect (Login Kit)
lib/creators/        stats (pure: usual, ×, trends, borrow score, matching), scan (the pipeline)
lib/ai/              openai (one structured-output call), creators (account read, tags, plan)
lib/actions.ts       server actions
lib/data.ts          page reads (RLS)
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. The look and voice are in `BRAND.md`.
