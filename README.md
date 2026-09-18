# TRND

**Know what to make next.**

TRND writes weekly creative test briefs for a small DTC marketing team: up to three concepts
a week, each a hypothesis with the evidence behind it and what that evidence cannot say, in a
brief a creator can shoot from. It does not predict winners and it does not run ads. See
`PRODUCT.md` for the product, `GO-LIVE.md` for what to switch on and in what order.

## Quickstart

```bash
git clone <repo> && cd trnd
pnpm install
cp .env.example .env.local   # fill in what you have — everything degrades gracefully
pnpm seed                    # ~60 illustrative signals so the app demos instantly
pnpm dev                     # http://localhost:3000
```

Sign up, complete onboarding, and `/app/picks` writes the week's creative tests in the
background. Open one for the whole brief; choose it, mark it launched, close it with numbers
on Campaigns, and the Track record starts.

### Demo mode vs. real mode

With no env vars at all, TRND runs in a **loudly-labeled demo mode**: a seeded local
store (`.demo-data/`), local password accounts, and a deterministic template writer for the
briefs. Every screen works. Each integration switches on independently the moment its env
var lands — no code changes:

| Env var | Turns on |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Postgres with RLS + Supabase Auth (run `supabase/migrations/` in order, or `supabase db push`) |
| `GEMINI_API_KEY` | Model-written briefs and the founding analysis (structured output, Zod-validated, every fact checked before storage) |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Search volume per metro, the demand backbone |
| `APIFY_TOKEN` | Rival Meta and Google ads, the brand's and its rivals' posts and comments, per-term TikTok |
| `YOUTUBE_API_KEY` | The Shorts read per watch term (free) |
| `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Reddit threads on the brand's terms (free) |
| `META_APP_ID` + `META_APP_SECRET` | Connect a Meta ad account: its ad history syncs daily and tests get their results by name |
| `STRIPE_SECRET_KEY` + price ids | Billing: hosted checkout, customer portal, webhook-driven plan state |
| `RESEND_API_KEY` + `EMAIL_FROM` | The Monday email and founder alerts |
| `PILOT_INVITE_CODE` | Signup needs the code; the landing page sends everyone else to the application |
| `CRON_SECRET` | Protects `/api/cron/*` and `/api/jobs/week` (see `vercel.json` for schedules) |

`GET /api/health` reports which mode each subsystem is running in and the day's spend.

## Commands

```bash
pnpm dev / build / start   # Next.js 16 (App Router, TS strict, Tailwind v4)
pnpm lint                  # eslint
pnpm test                  # vitest unit suite
pnpm test:e2e              # Playwright: signup → onboarding → the week's tests →
                           #   choose → launch → results → track record
pnpm seed                  # seed signals/series (idempotent)
pnpm job:ingest            # run all signal adapters now (partial-success semantics)
pnpm job:recommend         # rank this week's candidates for every business
pnpm tsx scripts/probe-tiktok-apify.ts "shower filter"   # one live run of the TikTok actor
```

## Map

```
app/                  routes: landing, auth, onboarding, /app (picks, campaigns, record,
                      snapshot, settings), cron and job routes
components/           landing sections, app UI, the brief, onboarding wizard
lib/db/               ONE Repo interface; supabase/ + demo/ implementations; seed data
lib/signals/          adapter interface, hardened HTTP, source adapters, ingest
lib/intel/            rivals: discovery, their ads and posts, the brand's own accounts
lib/scoring/          the four-signal model that orders candidates
lib/recommend/        the weekly ranking
lib/picks/            the creative test: writer rules, evidence, evaluation, the week job
lib/ads/              the brand's own results: export import, Meta history sync, runs
lib/record/           outcomes, the track record, predicted against actual
lib/ai/               gemini.ts (only SDK import), versioned prompts, schemas, fallback
supabase/migrations/  full schema, RLS on every table
scripts/              seed, job runners, live probes
tests/                unit (fixtures for every parser) + e2e
```

## Notes

- Amber = the one primary action. Mint = measured reality. Ink-faint = the old way.
- `BUILD_LOG.md` is the chronological build record; `DECISIONS.md` the judgment calls;
  `BLOCKED.md` the integrations awaiting credentials.
