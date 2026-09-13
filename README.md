# TRND

**Know what to advertise — before your competitors do.**

TRND is an AI creative strategist for a direct-to-consumer brand where paid social drives
growth. Every week it reads that brand's customers, its category, its competitors and its
own ad results, then says what to advertise next: the product, the audience, the angle,
the format, and three scripts to shoot.

The loop: **Detect → Match → Position → Launch → Learn.** Step 4 is a feature; any LLM
writes ad copy. The moat is 2, 3, and 5 — the performance data that comes back from the
brands' own ad accounts. See `TRND-BUILD-BRIEF.md` for the full product brief and
`design/` for the visual references.

**Who it is for.** One customer: a DTC brand spending roughly $20K–$150K a month on paid
social, with no in-house creative strategist. One price: **$250/month or $2,500/year for
the first ten brands, locked for life while the subscription stays continuous**, then
**$500/month or $5,000/year**. The trial is 14 days, full product, no card. There is a
results guarantee: run a TRND call inside the first 30 paid days, and if it does not beat
the brand's own trailing median cost per result, that month is refunded (honoured by hand
in Stripe). Every number above lives in `lib/billing/index.ts` — the landing page, the
settings panel and the terms all print it from there, so change it once.

The local-business path (a business flagged `market = "local"`) still exists and still
runs — metro/DMA demand, weather triggers, Google Places rivals. It is not the customer
being sold to. See `PRODUCT.md` for what runs on each path.

## Quickstart

```bash
git clone <repo> && cd trnd
pnpm install
cp .env.example .env.local   # fill in what you have — everything degrades gracefully
pnpm seed                    # 61 illustrative signals so the app demos instantly
pnpm dev                     # http://localhost:3000
```

Sign up, complete onboarding, and `/app` shows this week's ranked picks. Open a pick for
the finding, the grade, the bet and the scripts; **Build the campaign** produces the full
creative package.

The seed set is demo data, not production data: 61 terms across the seven internal signal
verticals, all local-category examples (`lib/db/seed-data.ts`). Production never ranks or
cites seeded rows.

### Demo mode vs. real mode

With no env vars at all, TRND runs in a **loudly-labeled demo mode**: a seeded local
store (`.demo-data/`), local password accounts, and a deterministic brand-voiced
campaign generator. Every screen works. Each integration switches on independently the
moment its env var lands — no code changes:

| Env var | Turns on |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Postgres with RLS + Supabase Auth (run `supabase/migrations/` in order, or `supabase db push`) |
| `GEMINI_API_KEY` | Real model generation (models resolved live, structured output, Zod-validated, falls back on violation) |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Real search volume and week-over-week deltas per watch term — the demand backbone |
| `META_APP_ID` + `META_APP_SECRET` | Connect the brand's Meta ad account: launch paused campaigns into it, sync results and past ad history daily |
| `STRIPE_SECRET_KEY` + price ids | Billing: hosted checkout, customer portal, webhook-driven plan state, trial enforcement |
| `NOTIFY_WEBHOOK_URL` / `RESEND_API_KEY`+`NOTIFY_EMAIL_TO` | Founder alerts: every demo request and signup pushed to Slack/email |
| `YOUTUBE_API_KEY` | YouTube signal adapter |
| `APIFY_TOKEN` | Per-term TikTok reads, rival ad reads and social reads (paid) |
| `GOOGLE_PLACES_API_KEY` | Local path only: rival ratings, review mining, nearby-rival discovery |
| `CRON_SECRET` | Protects `/api/cron/*` (see `vercel.json` for schedules) |

`.env.example` is the full list, each key annotated with what it costs and what it buys.
`GET /api/health` reports which mode the database, generation and billing are running in.

Recommendation fit never depends on a key: a deterministic concept judge
(`lib/recommend/relevance.ts`) gates every ranking, so a term with no overlap with what
the brand actually sells can never ride momentum to the top of the week; the Gemini judge
refines that read when configured.

**Detect follows the `market` flag** (`lib/signals/geo.ts`, `lib/signals/ingest.ts`).
An online brand is read **nationally**: no metro resolution, no state geo, no weather, and
its rivals are competing brands proposed by the model and then verified against the live
web and the Meta Ad Library (`lib/intel/discover-brands.ts`). A business flagged `local`
takes the other path: its city resolves to a Nielsen DMA metro so Google Trends interest
and rising related queries are measured per metro, Open-Meteo forecasts (keyless) fire
weather demand triggers per place, and Google Places supplies nearby rivals and review
text. Metro-measured signal earns a transparent locality bonus in scoring, and every
provenance detail renders in the UI.

See `BLOCKED.md` for exactly why each integration is stubbed in this environment and the
seam to make it real.

## Commands

```bash
pnpm dev / build / start   # Next.js 16 (App Router, TS strict, Tailwind v4)
pnpm lint                  # eslint
pnpm test                  # vitest unit suite — 819 tests across 81 files
pnpm test:e2e              # Playwright: signup → onboarding → recommendation →
                           #   campaign → launch → results → learnings
pnpm seed                  # seed signals/series/learning priors (idempotent)
pnpm job:ingest            # run all signal adapters now (partial-success semantics)
pnpm job:recommend         # score this week's opportunities for every business
pnpm eval:quality          # run the real pipeline over synthetic businesses and grade
                           #   it; exits 1 on a bad judgement or an unsupported claim
```

Typechecking needs one extra step first:

```bash
npx next typegen           # REQUIRED FIRST — Next 16 generates the global
npx tsc --noEmit           #   PageProps / LayoutProps / RouteContext types
```

`next dev` and `next build` run typegen themselves, so a clean checkout that has only ever
run `tsc` fails with confusing "Cannot find name 'PageProps'" errors on every route file.
Run `next typegen` and they disappear. Both commands are clean on the current tree.

## Map

```
app/                  routes (landing, auth, onboarding, /app product screens, cron, admin)
components/           landing sections, app UI, pick screens, onboarding wizard
lib/db/               ONE Repo interface; supabase/ + demo/ implementations; seed data
lib/signals/          adapter interface, hardened HTTP, 14 source adapters, ingest
lib/scoring.ts        the legacy component formula + the four-signal blend
lib/scoring/          the four-signal model that ranks the week (customer, culture,
                      competitive, brand → Opportunity Grade)
lib/recommend/        weekly ranking job, insights, history, the read on a pick
lib/picks/            the week's picks: the staged week job, detail view, export
lib/intel/            rivals (brand discovery, ad + social reads), Ask, standing questions
lib/ads/              Meta connect, launch, daily results sync, ad-history import
lib/ai/               gemini.ts (only SDK import), versioned prompts, schemas, fallback
lib/documents/        uploads read once — facts kept, file dropped
lib/results/          results math + learnings write-back (the flywheel)
supabase/migrations/  full schema, RLS on every table
scripts/              seed, manual job runners, per-source probes
tests/                unit (fixtures for every parser) + e2e
```

## Notes

- Amber = opportunity / the one primary action. Mint = measured reality. Ink-faint =
  the old way. Don't use amber and mint as an arbitrary palette — they mean things.
- Dark is the default theme; light is an explicit toggle choice, persisted.
- No horizontal scroll at 375px is a rule for every screen, not a one-off measurement.
  Lighthouse has not been re-run since the landing page was rewritten for the DTC buyer,
  so the old score line is gone rather than repeated — measure it again before quoting a
  number.
- `BUILD_LOG.md` is the chronological build record; `DECISIONS.md` the judgment calls;
  `BLOCKED.md` the integrations awaiting credentials; `GO-LIVE.md` the founder's list of
  accounts and keys, in the order a DTC brand feels them.
