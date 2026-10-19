# TRND for creators

Tells a TikTok creator exactly what to post next. TRND reads the creator's public videos, finds creators like them and
what is rising in their niche, and writes a weekly plan: three videos to make, each with the hook, a script second by
second, length, sound, when to post, caption and hashtags, and the evidence it rests on. An idea the creator adds to
their week is matched to the video they post and checked 48 hours later against their usual views.

What TikTok data is available, from where, and what is not: `DATA.md`.

## Onboarding (landing → paid)

Built from a study of comparable tools (`DATA.md` covers the data side). The rule: show real value before asking for
anything, then ask for one thing at a time.

1. **Landing** (`/`): one handle box, "Get my free plan". No account, no TikTok login.
2. **Free preview** (`/start/[id]`, `lib/preview/`): reads the profile, asks "Is this you?", then reads the niche and
   writes the plan while asking one optional question (the goal). Shows the numbers, creators like them, what's
   rising, and **idea 1 in full**; ideas 2 and 3 show their hooks only. One step per request (`/api/preview/[id]/step`),
   so nothing outruns a function. Reused per handle for 72 hours; 3 new previews per visitor (hashed IP) a day and a
   daily budget for all (`PREVIEW_DAILY_CAP`); past it, visitors go to sign-up. Optional Turnstile bot check.
3. **Sign-up** (`/signup`): Continue with Google, or an emailed 6-digit code. No password. The preview is claimed into
   the new account (`lib/creators/create.ts`), so the app opens on the plan at once.
4. **Welcome** (`/app/welcome`): two one-tap steps (goal; how they film and how often), then the **trial**: a timeline
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
   - **niche**: recent videos under the niche hashtags. Creators like them are picked from those: posting in several
     niche hashtags, a tenth to ten times their size, never under 1K or (for small accounts) capped below 20K
     (`rankPeers`, `peerBand`). A peer the owner removed is never matched again.
   - **peers**: each peer's last 15 videos.
   - **trends**: every hashtag and borrowed sound in the last 14 days of videos read, counted this week against last
     and staged early, rising, peaking or fading (`trendRows`, `stageOf`), snapshotted daily.
   - **tag**: when a plan is due (weekly, or on "Read again now"), the format and hook of up to 60 untagged videos.
   - **plan**: ideas posted since the last scan are matched (`matchIdea`) and checked after 48 hours (`outcomeOf`);
     one with no numbers waits rather than getting a made-up verdict. When due, the plan is written from the
     creator's breakouts, peer videos ranked by **borrow score** and the early or rising trends. A source the model
     names must be one it was given, of the kind the idea claims, or it is dropped.
3. **Every day**, Vercel Cron hits `/api/cron/scan`, which fans out one invocation per due creator. A new weekly plan is
   emailed.

**The numbers** (`lib/creators/stats.ts`) use public counts only. A creator's "usual" is the median and middle half of
the views of their settled videos (48 hours or older). "×" is a video's views over its creator's median. The borrow score
(0-100) blends how far a peer's video beat its own creator's usual (45%), shared niche hashtags (25%), freshness (15%) and
saves per 1K views against that creator's usual (15%).

## Setup

```
pnpm install
cp .env.example .env.local   # Supabase, OpenAI and APIFY_TOKEN at minimum
pnpm dev
```

This is its own product: give it a new Supabase project and paste `supabase/setup.sql` into its SQL editor (safe to
re-run). It creates `creators`, `peers`, `videos`, `video_snapshots`, `follower_snapshots`, `trend_snapshots`, `plans`,
`idea_runs` and `tiktok_connections`, with owner-read RLS on all but the last (tokens are service-role only). Every
list read pages past PostgREST's 1,000-row cap (`lib/db/rows.ts`).

**Billing**: two Stripe recurring prices for the same plan, `STRIPE_PRICE_WEEKLY` ($9.99) and `STRIPE_PRICE_MONTHLY`
($24.99). The webhook records which one as `creators.plan` (`weekly` or `monthly`).

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
