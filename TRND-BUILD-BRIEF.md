# TRND — Autonomous Build Brief

**For:** a Claude Code agent running unattended (cloud session, overnight).
**Repo:** `trnd`
**Author of this brief:** prepared for Nick. You are building his product. He is asleep.

---

## 0. How to use this file

Drop this file at the repo root. Kick the agent off with:

> Read `TRND-BUILD-BRIEF.md` in full, then build it. Work autonomously — I'm asleep and
> will not answer questions. Follow the Overnight Protocol in §3 exactly. Do not stop
> until the Definition of Done in §14 is met or you hit the wall described in §3.

Everything the agent needs is in this file. It does not need to ask a single question.

---

## 1. What TRND is

**One line:** TRND tells a small business what to advertise this week, why now, and hands
them the finished campaign — then learns from what actually converted.

**The loop, in five steps:**

| # | Step | What happens |
|---|------|--------------|
| 1 | **Detect** | Read real demand signal — search, social, local intent — in this business's category and area, daily. |
| 2 | **Match** | Check what's rising against what this business actually sells, and what competitors are missing. |
| 3 | **Position** | Build the angle: the hook, the offer, the audience most likely to convert. |
| 4 | **Launch** | Produce finished ad copy, creative direction, and targeting — ready to run today. |
| 5 | **Learn** | Pull real results back in — clicks, bookings, cost per result, revenue — so next week is sharper. |

**Where the moat is.** Step 4 is a feature; any LLM writes ad copy. The defensibility is
in 2, 3, and 5 — specifically the performance data that comes back from clients' own
connected ad accounts. Build the schema and the plumbing for step 5 as a first-class
citizen even though there's little data in it on day one. It is the point of the company.

### What TRND is NOT — hold this line in every piece of copy and UI

- NOT "AI social listening"
- NOT "trend analytics"
- NOT "an AI ad generator"
- NOT a dashboard of mentions

It is **decision replacement**, not decision support. The enterprise tools (Brandwatch,
Talkwalker, Meltwater, Sprinklr) hand a human an insight and stop. TRND goes all the way
to a launchable campaign for a single local business with a $40/day budget.

### Target customer

Small, local, high-consideration businesses that live on paid social. Ship with these
categories:

`Restaurants & cafés` · `Home services` · `Health & beauty` · `Fitness studios` ·
`Retail & boutiques` · `Auto services` · `Dental & wellness`

> **Note on a tension in the source material:** an earlier internal vision deck scoped
> Phase 1 narrowly to aesthetic injectables & skin clinics. The public landing page is
> broad SMB. **Resolution for this build:** the data model is category-agnostic and the
> product ships with the seven categories above. Aesthetic/med-spa is treated as the
> best-served vertical (deepest seed data, best prompt priors), not the only one. Do not
> hardcode a single vertical anywhere.

### Roadmap framing (for UI copy only — do not build phases 2–4)

- **Phase 1 (build this):** Ad campaigns
- Phase 2: Email & SMS
- Phase 3: Reviews & reputation
- Phase 4: Full outreach suite

---

## 2. Stack — locked, do not deviate

| Layer | Choice |
|---|---|
| Framework | Next.js 15+, App Router, TypeScript strict |
| Styling | Tailwind CSS v4 with the design tokens in §6 |
| DB / Auth | Supabase (Postgres + Supabase Auth, email magic link + password) |
| ORM | Supabase JS client + SQL migrations in `supabase/migrations/`. No Prisma. |
| AI | Google Gemini via `@google/genai` |
| Jobs | Vercel Cron routes under `app/api/cron/*` |
| Deploy target | Vercel (config it; do not attempt to deploy without credentials) |
| Tests | Vitest for units, Playwright for one happy-path E2E |
| Package manager | pnpm |

If Supabase CLI cannot reach a remote project, run Supabase locally
(`supabase start`) and write migrations against that. Do not silently swap the database.

---

## 3. Overnight Protocol — read this twice

You are running unattended. These rules override your normal instincts.

1. **Never block on a question.** If a decision is ambiguous, pick the option that keeps
   you moving, write it to `DECISIONS.md` with a one-line rationale, and continue.
2. **Never block on a credential.** If a secret is missing after following §4, implement
   the integration behind its interface, register it as unavailable, log it in
   `BLOCKED.md`, and keep building everything downstream of it against the seeded path.
3. **Commit constantly.** Small, working commits on a branch named
   `feat/mvp-overnight`. Never commit to `main`. Never force-push. Open a PR at the end.
4. **Keep a build log.** Append to `BUILD_LOG.md` as you go: what you built, what broke,
   what you decided. Nick reads this first thing in the morning.
5. **Green before moving on.** `pnpm build`, `pnpm lint`, and `pnpm test` must pass before
   each milestone commit. A milestone is not done if the build is red.
6. **Time-box rabbit holes.** If any single problem eats more than ~30 minutes of
   attempts, stub it behind its interface, log it in `BLOCKED.md`, move on. A finished
   app with two stubs beats a half-app with one perfect scraper.
7. **No fake success.** Never write a test that asserts nothing, never catch-and-swallow,
   never mark something done in `BUILD_LOG.md` that you did not verify running.
8. **Order matters.** Follow the milestone order in §13. Vertical slices, not layers —
   each milestone should leave the app runnable.
9. **The wall.** Stop only if: the repo won't build from a clean clone after three
   attempts, or you'd have to commit a secret, or continuing means deleting Nick's
   existing work. In those cases write `STOP.md` explaining precisely what happened and
   what you need, and end cleanly.

---

## 4. Secrets — where they come from

### Gemini API key

Nick keeps a working Gemini key in his **`GRWM` repository**. Find it, don't ask for it.

```bash
# Look for GRWM as a sibling of this repo, then anywhere reasonable
ls -d ../GRWM ../grwm ~/GRWM ~/code/GRWM ~/repos/GRWM 2>/dev/null
find ~ -maxdepth 4 -type d -iname "GRWM" 2>/dev/null | head

# Then pull the key out of its env files (NOT from committed source)
grep -rIhs -E "GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_API_KEY" \
  ../GRWM/.env* ../GRWM/**/.env* 2>/dev/null
```

If GRWM is not on this machine, try `gh repo clone` for it — it is Nick's own repo, so
the cloud session's `gh` auth should reach it. If the key still isn't found, that is a
§3.2 situation: log it in `BLOCKED.md` and build the Gemini layer against a deterministic
local stub that returns realistic campaign JSON, so every screen downstream still works.

**Hard rules:**
- The key goes in `trnd/.env.local` only. `.env.local` is in `.gitignore`. Verify it.
- Never echo the key into `BUILD_LOG.md`, a commit message, a test fixture, or a comment.
- Commit `.env.example` with every variable name and empty values.

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
YOUTUBE_API_KEY=          # optional; skip that adapter if absent
REDDIT_USER_AGENT=trnd-signal/0.1 (by /u/trnd)
CRON_SECRET=
```

---

## 5. Brand voice

Copy is the product's personality. Match it exactly.

**Do:**
- Short declaratives. "Know what's moving before you spend a dollar."
- Concrete nouns and real numbers. "↑34% search interest", "8.7 / 10", "2.1× better".
- Define by negation, then land the positive. "Not a dashboard of mentions. Instead: …"
- Address one owner, not a market. "your category", "your zip", "this clinic".
- Em dashes for the turn in a sentence.
- UPPERCASE MONO for labels and metadata. Sentence case for headings.

**Don't:**
- No "revolutionize", "unlock", "supercharge", "seamless", "leverage", "empower".
- No exclamation marks. No emoji in product UI.
- Never promise guaranteed results. Illustrative data must be labeled illustrative.

**Reference lines (reuse verbatim where they fit):**
- "Know what to advertise — before your competitors do."
- "Built for the businesses that live and die by attention."
- "The more businesses on TRND, the sharper it gets."
- "No agency retainer. No annual contract."

---

## 6. Design system

The reference implementation is the landing page HTML Nick will place at
`design/trnd-landing.html`. If it's there, it is the visual source of truth — port it,
don't reinvent it. Everything needed to rebuild it from scratch is below regardless.

### Type

| Role | Family | Usage |
|---|---|---|
| Display | **Bricolage Grotesque** 600/700/800 | Headings, buttons, card titles, logo |
| Body | **Inter** 400/500/600 | Paragraphs, form fields |
| Mono | **IBM Plex Mono** 400/500/600 | Labels, eyebrows, metrics, tickers, pills |

Heading sizes use `clamp()`: h1 `clamp(36px,4.6vw,58px)` at `line-height:1.04`,
`letter-spacing:-0.02em`. Section h2 `clamp(26px,3.4vw,38px)`.

### Color tokens — both themes, ship both

Light is the default. Dark applies from `prefers-color-scheme`, and a `data-theme`
attribute on `<html>` always overrides the OS. Paste this into `globals.css` and expose
it to Tailwind v4 via `@theme`.

```css
:root{
  color-scheme:light;
  --bg:#FDF6E3;            --bg-1:#FFFFFF;         --bg-2:#F7EACB;
  --paper:#FFFFFF;         --card-stroke:#EFE0C0;
  --ink:#33200F;           --ink-soft:#6B4A2C;     --ink-faint:#8F6B44;
  --line:rgba(61,39,22,0.10);   --line-strong:rgba(61,39,22,0.20);
  --amber:#D99A12;         --amber-ink:#2B1B08;    --amber-hover:#EFAE21;
  --amber-glow:rgba(217,154,18,0.22);
  --amber-soft:rgba(217,154,18,0.14);  --amber-softer:rgba(217,154,18,0.03);
  --mint:#1EA7AE;          --mint-ink:#EAFBFC;     --mint-glow:rgba(30,167,174,0.20);
  --red:#B23A22;
  --nav-bg:rgba(253,246,227,0.85);     --texture-dot:rgba(61,39,22,0.06);
  --fw-ring:#E3D4AE;       --fw-node-stroke:#EFE0C0;
  --radius:16px;           --radius-sm:10px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){ /* dark values below */ }
}
:root[data-theme="dark"]{ /* same dark values */ }

/* dark values */
color-scheme:dark;
--bg:#110B05;            --bg-1:#1F150B;         --bg-2:#2D2011;
--paper:#FBF6EC;         --card-stroke:#221408;
--ink:#FFF9EC;           --ink-soft:#F5E6C8;     --ink-faint:#E3C896;
--line:rgba(255,249,236,0.14);  --line-strong:rgba(255,249,236,0.26);
--amber:#FFC72C;         --amber-ink:#2B1B08;    --amber-hover:#FFD466;
--amber-glow:rgba(255,177,61,0.18);
--amber-soft:rgba(255,177,61,0.09);  --amber-softer:rgba(255,177,61,0.02);
--mint:#2FC9C6;          --mint-ink:#072A2A;     --mint-glow:rgba(111,231,194,0.18);
--red:#FF6E52;
--nav-bg:rgba(17,11,5,0.88);         --texture-dot:rgba(255,249,236,0.07);
--fw-ring:#2D2011;       --fw-node-stroke:#3D2C18;
```

**Semantics — never break these:**
- **Amber** = opportunity, the active/primary action, the thing to do now. One primary
  action per screen.
- **Mint** = measured reality — real results, verified outcomes, confirmations, sparklines.
- **Ink-faint** = the old way, deprecated, secondary metadata.
- Never use amber and mint as an arbitrary two-color palette. They mean different things.

### Component conventions

- Buttons: fully round (`border-radius:999px`), display font 600, 13px/24px padding,
  `:active{transform:scale(0.97)}`.
- Cards: `--bg-1` fill, 1px `--line` border, `--radius-sm`.
- Eyebrow labels: mono, 11.5px, `letter-spacing:0.1em`, uppercase, amber, with a small
  amber dot before it (`::before`, 7px circle, 4px glow ring).
- Pills: mono 11px, 1px `--line-strong` border, fully round.
- Every SVG in the UI must take its colors from CSS variables, not hardcoded hex, so
  both themes work. Inline `fill`/`stroke` attributes are allowed only as a fallback that
  CSS overrides.
- Reveal-on-scroll animations must default to **visible** and only hide once JS confirms
  `IntersectionObserver` exists. Never let a failed observer leave a blank page.
- Respect `prefers-reduced-motion` everywhere.

---

## 7. Data model

Write as SQL migrations in `supabase/migrations/`. Every table gets RLS. A user reaches
rows only through a business they own. Service-role key only in cron routes.

```
profiles            id (=auth.users.id), email, full_name, created_at

businesses          id, owner_id → profiles, name, category, city, region,
                    country, lat, lng, radius_miles (default 20), website,
                    price_band, brand_voice_notes, created_at

services            id, business_id, name, description, price_cents, is_active

signals             id, source ('google_trends'|'reddit'|'youtube'|'news'),
                    term, normalized_term, category, geo, metric_type,
                    value numeric, delta_pct numeric, window_days,
                    captured_at, raw jsonb
                    unique (source, normalized_term, geo, captured_at::date)

signal_series       id, normalized_term, geo, day date, value numeric
                    -- for sparklines and delta math

opportunities       id, business_id, signal_id, week_of date, score numeric(3,1),
                    rationale text, matched_service_id, competitor_gap text,
                    status ('new'|'accepted'|'dismissed'|'launched'), created_at

campaigns           id, opportunity_id, business_id, angle, hook, offer,
                    audience jsonb, channel ('meta'|'google'|'tiktok'),
                    status ('draft'|'exported'|'live'|'complete'),
                    model_used, prompt_version, created_at

creatives           id, campaign_id, kind ('headline'|'primary_text'|'script'|
                    'static_brief'|'landing_copy'), content text, variant_index int

campaign_results    id, campaign_id, impressions, clicks, spend_cents,
                    bookings, revenue_cents, ctr, cpa_cents, source
                    ('manual'|'meta_api'), recorded_at

learnings           id, category, geo_bucket, angle_type, lift numeric,
                    sample_size int, updated_at
```

`campaign_results` accepts **manual entry** in the MVP — a simple form where the owner
types in what happened. Structure it so a Meta Marketing API sync drops in later without
a schema change. This is the flywheel; do not skip it because there's no API integration.

---

## 8. Signal ingestion — real sources

Build an adapter interface first, then implement adapters behind it:

```ts
interface SignalAdapter {
  name: string
  isAvailable(): Promise<boolean>
  fetch(input: { terms: string[]; geo: string; windowDays: number }): Promise<RawSignal[]>
}
```

**Implement, in this order:**

1. **Google Trends daily RSS** — `https://trends.google.com/trending/rss?geo=US`.
   No key, reliable, real. Parse with `fast-xml-parser`.
2. **Reddit public JSON** — `https://www.reddit.com/r/<sub>/top.json?t=week&limit=100`.
   No key needed; a descriptive `User-Agent` is mandatory or you get 429'd. Map a
   category → subreddit list (e.g. health & beauty → `r/30PlusSkinCare`, `r/SkincareAddiction`,
   `r/Hair`; restaurants → `r/food`, `r/Cooking`, local city subs).
3. **Google News RSS** — `https://news.google.com/rss/search?q=<term>` for corroboration.
4. **Google Trends interest-over-time** via the `google-trends-api` package — real
   numbers, but rate-limits hard and breaks often. Wrap it in retry + circuit breaker.
   **If it fails, it must degrade, not crash the job.**
5. **YouTube Data API v3** — only if `YOUTUBE_API_KEY` is present.
6. **TikTok** — no viable free API. Do not attempt. Note it as a known gap.

**Rules:**
- Every adapter: timeout (10s), retry with exponential backoff (max 3), and a circuit
  breaker that disables the adapter for the rest of the run after repeated failure.
- Cache every raw response to the `signals.raw` column. Never re-hit a source you already
  pulled today.
- The ingestion job must succeed with **partial** results. One dead source is a logged
  warning, not a failed run.
- Ship a `pnpm seed` script with ~60 realistic signal rows across all seven categories so
  the app is demoable even with zero network access. Seeded rows are flagged
  `source='seed'` and rendered with an "illustrative" marker in the UI.

**Scoring (`opportunities.score`, 0–10).** Keep it simple, transparent, and tunable in
one file — `lib/scoring.ts`:

```
score = 0.35 * normalized_delta        // how fast it's rising
      + 0.25 * service_match           // does this business already sell it
      + 0.20 * competitor_gap          // inverse of local ad saturation (proxy ok)
      + 0.20 * historical_lift         // from `learnings`, 0.5 neutral when empty
```

Every score must render with its rationale in plain English. A number with no
explanation is exactly the "dashboard of mentions" TRND refuses to be.

---

## 9. Gemini integration

```bash
pnpm add @google/genai
```

- Wrap all model calls in `lib/ai/gemini.ts`. Nothing else in the codebase imports the
  SDK directly.
- **Do not hardcode a model name from memory.** At startup, list available models via the
  API and pick the newest stable Flash for classification/ranking and the newest stable
  Pro for creative generation. Cache the resolved names in a module constant with a
  documented fallback chain, and log which ones resolved to `BUILD_LOG.md`.
- **Structured output only.** Use the SDK's JSON schema / response-schema support for
  every call. Validate the response with Zod. Retry once on a schema violation, then fall
  back to the deterministic template generator.
- Store `model_used` and `prompt_version` on every campaign row. When the prompt changes,
  bump the version — Nick needs to be able to tell which generation produced what.
- Prompts live in `lib/ai/prompts/` as versioned TypeScript template functions, not
  inline strings scattered through route handlers.
- Every prompt gets the brand voice rules from §5 in its system instruction. Generated ad
  copy that sounds like generic AI marketing output is a bug, not a style preference.

**The three generation calls:**

1. `matchSignalsToBusiness` — given business profile + services + top signals, return
   ranked opportunities with rationale and a competitor-gap read.
2. `buildAngle` — given one opportunity, return `{ angle, hook, offer, audience }`.
3. `generateCampaign` — given the angle, return 5 headlines, 3 primary texts, 3 short-form
   video scripts, 3 static creative briefs, and landing copy.

---

## 10. Screens

### Marketing (public)

`/` — the landing page. Port `design/trnd-landing.html` to React components,
preserving: sticky nav with theme toggle, scrolling signal ticker, hero with the animated
signal→ad-card SVG, "old way / TRND way" split, the interactive five-step explainer,
signal proof cards, the flywheel diagram, the roadmap row, the pricing band, and the demo
request form. The demo form must write to a real `demo_requests` table.

### App (authenticated)

| Route | Purpose |
|---|---|
| `/login`, `/signup` | Supabase Auth. Magic link + password. |
| `/onboarding` | Multi-step: business name → category → location + radius → services & prices → brand voice notes. Writes `businesses` + `services`. Cannot be skipped. |
| `/app` | **This week's recommendation.** The hero screen. One opportunity, its score, its rationale, the signal sparkline, and one primary action: "Build the campaign". |
| `/app/opportunities` | Ranked list for the week, each with score + one-line why. Accept / dismiss. |
| `/app/campaigns/[id]` | The finished campaign: angle, hook, offer, audience, all creatives in copyable blocks, and an export (copy-all / download JSON / CSV for Meta). Mark as launched. |
| `/app/results` | Manual result entry per launched campaign + a simple history table with CTR / cost per result / revenue. |
| `/app/settings` | Business profile, services, radius, theme. |

**`/app` is the product.** If you run short on time, that screen and
`/app/campaigns/[id]` must be excellent and everything else can be plain.

### Jobs

- `POST /api/cron/ingest` — daily, all adapters, writes `signals` + `signal_series`.
- `POST /api/cron/recommend` — weekly, generates `opportunities` per business.
- Both authenticate via `CRON_SECRET` bearer token. Both are idempotent per day/week.
- Both must be runnable by hand: `pnpm job:ingest`, `pnpm job:recommend`.

---

## 11. Milestones — build in this order

Each milestone ends with a green build, a commit, and a `BUILD_LOG.md` entry.

1. **Scaffold** — Next.js + TS + Tailwind v4 + design tokens + both themes + fonts.
   A `/styleguide` route rendering every token, button, card, and pill in both themes.
2. **Supabase** — project/local instance, full schema, RLS policies, typed client,
   seed script. Verify RLS actually blocks cross-business reads with a test.
3. **Auth + onboarding** — signup → onboarding → lands on an empty `/app`.
4. **Landing page** — port the HTML, wire the demo form to the DB.
5. **Ingestion** — adapter interface, Google Trends RSS + Reddit adapters, ingest job,
   real rows in the DB. Prove it by running the job and showing counts in the log.
6. **Scoring + opportunities** — `lib/scoring.ts`, recommend job, `/app` renders a real
   recommendation with its rationale.
7. **Gemini generation** — the three calls, `/app/campaigns/[id]` renders a real generated
   campaign, export works.
8. **Results + learnings** — manual entry, history table, `learnings` written back and
   actually feeding the score.
9. **Hardening** — error boundaries, empty states, loading skeletons, mobile at 375px,
   Lighthouse ≥ 90 on `/`, `pnpm build` clean.
10. **Handoff** — `README.md`, `DECISIONS.md`, `BLOCKED.md`, `BUILD_LOG.md`, PR opened.

---

## 12. Definition of done

- [ ] `git clone` → `pnpm i` → fill `.env.local` from `.env.example` → `pnpm dev` works.
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` all pass.
- [ ] A new user can sign up, onboard, and land on `/app` with a real recommendation.
- [ ] That recommendation is derived from **real ingested signal**, not only seed rows —
      or `BLOCKED.md` says precisely why not.
- [ ] Clicking through produces a **Gemini-generated campaign** with all creative assets.
- [ ] Results can be entered and appear in history.
- [ ] Both light and dark themes are correct on every screen, including all SVG artwork.
- [ ] Mobile 375px works on every screen. No horizontal scroll anywhere.
- [ ] No secret is committed. `git log -p | grep -i "api[_-]key"` finds nothing real.
- [ ] One Playwright E2E covering signup → onboarding → recommendation → campaign.
- [ ] PR open against `main` with a summary of what shipped and what didn't.

---

## 13. Guardrails

- Do not commit secrets. Do not print them. Do not put them in fixtures.
- Do not push to `main`. Do not force-push. Do not rewrite existing history.
- Do not delete or restructure anything already in the `trnd` repo without saying so in
  `DECISIONS.md`. If the repo already has code, adapt to its conventions over this brief's
  preferences and note the divergence.
- Do not add a dependency you don't use. Do not add a UI component library — the design
  system here is specific and hand-rolled.
- Do not fabricate results data anywhere it could be mistaken for real. Illustrative
  figures in the marketing page must carry the existing "Trend data shown throughout is
  illustrative" disclosure.
- Do not scrape anything behind a login or a paywall, and respect `robots.txt` and rate
  limits on every source.

---

## 14. The morning report

Last thing before you stop, append a section to `BUILD_LOG.md` titled
**"Morning Report"** answering, briefly:

1. What works end to end right now?
2. What's stubbed, and where's the seam to make it real?
3. What did you decide that Nick might disagree with?
4. What's the single highest-value next hour of work?
5. Exact commands to run it locally.

Keep it under a page. He'll read it with coffee.
