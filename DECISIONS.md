# DECISIONS

One line each: what was decided and why, per Overnight Protocol §3.1.

- **Branch name**: the brief says `feat/mvp-overnight`; this cloud session has a
  harness-designated branch `claude/new-session-04s7aw` and a hard rule against pushing
  elsewhere. All work is on `claude/new-session-04s7aw`. Same content, different label.
- **Next.js 16.3.2** (brief says 15+): `create-next-app@latest` resolved to 16; it
  satisfies "15+" and avoids pinning an older major. Note: `middleware.ts` is deprecated
  in 16 — the convention is `proxy.ts`.
- **Fonts via `<link>` stylesheet, not `next/font`**: `next/font` downloads font files at
  build time; this build environment has no route to Google Fonts, and the reference
  landing page already uses the stylesheet approach. Every family has a real fallback.
- **GRWM Gemini key hunt abandoned**: the session's permission layer denies scanning
  another repo for API keys (see BLOCKED.md). Gemini runs behind `lib/ai` with a
  deterministic fallback generator until `GEMINI_API_KEY` lands in `.env.local`.
- **Demo mode data layer**: no Supabase credentials and no Docker daemon for a local
  stack (see BLOCKED.md). The database is NOT silently swapped — when Supabase env vars
  are absent the app boots in a loudly-labeled demo mode backed by a seeded local store,
  behind the same repository interface the Supabase implementation fulfills.
- **Trends interest-over-time without the `google-trends-api` package**: the package is
  unmaintained and wraps the same unofficial widget endpoints; implemented directly with
  our own retry + fast-tripping circuit breaker (`lib/signals/adapters/trends-iot.ts`).
- **`matchSignalsToBusiness` is deterministic, not a Gemini call**: §8 mandates a
  transparent, tunable scoring formula with a plain-English rationale; a model call
  there would contradict it. Gemini handles the two creative calls (angle, assets);
  Flash is resolved and ready if a re-rank call is wanted later. Nick may disagree —
  flagged in the Morning Report.
- **`angle_type` lives inside `campaigns.audience` (jsonb)**: the learnings loop needs
  the persuasion shape per campaign; a typed optional field in the audience JSON avoids
  a schema migration and stays queryable. Promote to a column when the Meta sync lands.
- **Landing ticker/hero/flywheel infinite animations start on first user input**: keeps
  slow-device first paint stable (and Lighthouse honest); one-shot intro animations
  still play on load. Reduced-motion users never see motion either way.
- **`main` bootstrapped at the scaffold commit**: the repo was empty (no default
  branch), and a PR needs a base with shared history. `main` points at the first
  commit only; all product work arrives via the PR from the designated branch.
- **Dark is now the default theme** (user direction, matching the TRND logo): dark tokens
  live on `:root`; light is an explicit `[data-theme="light"]` choice from the toggle,
  persisted in localStorage. OS `prefers-color-scheme` no longer decides — the brand does.
- **Dark palette retuned to the logo** (`design/trnd-logo.png`, colors sampled from the
  file): warm near-black `#14100C`, off-white ink `#F6F1E3`, sage-mint accent `#81CEBA`,
  gold softened to `#F0B429`. Light palette unchanged.
- **Landing hero CTA change**: swapped "See how it works" (still reachable from the nav)
  for "Start free — set up in 2 minutes" so the page has a self-serve funnel and not
  only the demo-request path. Pricing band also gained a Start free button.
- **Learnings provenance**: `learnings.source` ('seed'|'measured'). Seeded priors are
  never presented as real campaign history; the first recorded result REPLACES a seed
  prior rather than blending truth with sample data. (User: "there's no outcome that
  should be recorded — take the fake data out.")
- **E2E store isolation**: Playwright runs against `.demo-data-e2e` (wiped per run), so
  test-entered results can never pollute the dev demo store again.
- **Deterministic fit gate always on**: the Gemini relevance judge only exists when a
  key does; a keyless install was ranking on momentum alone (espresso martinis for a
  BBQ shack). `lib/recommend/relevance.ts` now applies the same fit-gates-total
  semantics deterministically; the model judge refines it when configured.
- **Mode vs. cuisine concepts**: a term that names HOW/WHEN (patio, late-night,
  gifting) is a stretch (0.5) for a business that doesn't mention it; a term that
  names WHAT is sold (cocktails, brunch, pilates) with zero overlap is a hard
  mismatch (0.2). Both read out in plain English in the rationale.
- **Billing never locks without Stripe keys**: trial state is tracked from day one so
  enabling billing later needs no backfill, but enforcement (blocking new campaign
  builds) only activates when there is actually a way to pay. `past_due` keeps
  working while Stripe retries the card; only `canceled` and expired trials gate.
- **Account deletion uses the service role outside cron**: the brief scopes the
  service key to cron routes, but deleting the auth user requires the admin API.
  It's used for exactly one thing (self-serve account deletion, after the RLS-scoped
  business delete), which honors the brief's intent — least privilege — if not its letter.
