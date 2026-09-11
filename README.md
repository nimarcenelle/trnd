# TRND

**Know what to advertise — before your competitors do.**

TRND tells a small business what to advertise this week, why now, and hands them the
finished campaign — then learns from what actually converted.

The loop: **Detect → Match → Position → Launch → Learn.** Step 4 is a feature; any LLM
writes ad copy. The moat is 2, 3, and 5 — the performance data that comes back from
clients' own campaigns. See `TRND-BUILD-BRIEF.md` for the full product brief and
`design/` for the visual references.

## Quickstart

```bash
git clone <repo> && cd trnd
pnpm install
cp .env.example .env.local   # fill in what you have — everything degrades gracefully
pnpm seed                    # ~60 illustrative signals so the app demos instantly
pnpm dev                     # http://localhost:3000
```

Sign up, complete onboarding, and `/app` shows a scored recommendation immediately.
Click **Build the campaign** for the full creative package.

### Demo mode vs. real mode

With no env vars at all, TRND runs in a **loudly-labeled demo mode**: a seeded local
store (`.demo-data/`), local password accounts, and a deterministic brand-voiced
campaign generator. Every screen works. Each integration switches on independently the
moment its env var lands — no code changes:

| Env var | Turns on |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Postgres with RLS + Supabase Auth (run `supabase/migrations/` in order, or `supabase db push`) |
| `GEMINI_API_KEY` | Real model generation (models resolved live, structured output, Zod-validated, falls back on violation) |
| `STRIPE_SECRET_KEY` + price ids | Billing: hosted checkout, customer portal, webhook-driven plan state, trial enforcement |
| `NOTIFY_WEBHOOK_URL` / `RESEND_API_KEY`+`NOTIFY_EMAIL_TO` | Founder alerts: every demo request and signup pushed to Slack/email |
| `YOUTUBE_API_KEY` | YouTube signal adapter |
| `CRON_SECRET` | Protects `/api/cron/*` (see `vercel.json` for schedules) |

Recommendation fit never depends on a key: a deterministic concept judge
(`lib/recommend/relevance.ts`) gates every ranking so a BBQ smokehouse is never told to
advertise espresso martinis; the Gemini judge refines that read when configured.
`GET /api/health` reports which mode each subsystem is running in.

**Detect is local-first.** Business cities resolve to Nielsen DMA metros
(`lib/signals/geo.ts`), so Google Trends interest and rising related queries are
measured per metro, not nationally; Open-Meteo forecasts (keyless) fire weather demand
triggers per place (first heat wave → AC tune-ups, patio windows, freeze → tire swaps);
Google Autocomplete reads buying intent per watch term. Metro-measured signal earns a
transparent locality bonus in scoring, and every provenance detail renders in the UI.

See `BLOCKED.md` for exactly why each is stubbed in this environment and the seam to
make it real.

## Commands

```bash
pnpm dev / build / start   # Next.js 16 (App Router, TS strict, Tailwind v4)
pnpm lint                  # eslint
pnpm test                  # vitest unit suite
pnpm test:e2e              # Playwright: signup → onboarding → recommendation →
                           #   campaign → launch → results → learnings
pnpm seed                  # seed signals/series/learning priors (idempotent)
pnpm job:ingest            # run all signal adapters now (partial-success semantics)
pnpm job:recommend         # score this week's opportunities for every business
```

## Map

```
app/                  routes (landing, auth, onboarding, /app product screens, cron)
components/           landing sections, app UI, onboarding wizard
lib/db/               ONE Repo interface; supabase/ + demo/ implementations; seed data
lib/preview/          the public pre-signup snapshot: URL guard, terms, assembly
lib/signals/          adapter interface, hardened HTTP, five source adapters, ingest
lib/scoring.ts        the entire opportunity formula — tunable in one file
lib/recommend/        weekly ranking job
lib/ai/               gemini.ts (only SDK import), versioned prompts, schemas, fallback
lib/results/          results math + learnings write-back (the flywheel)
supabase/migrations/  full schema, RLS on every table
scripts/              seed + manual job runners
tests/                unit (fixtures for every parser) + e2e
```

## Notes

- Amber = opportunity / the one primary action. Mint = measured reality. Ink-faint =
  the old way. Don't use amber and mint as an arbitrary palette — they mean things.
- Lighthouse on `/`: 99 / 100 / 96 / 100. No horizontal scroll at 375px anywhere.
- `BUILD_LOG.md` is the chronological build record; `DECISIONS.md` the judgment calls;
  `BLOCKED.md` the integrations awaiting credentials.
