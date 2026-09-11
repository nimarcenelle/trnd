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
- **Repricing (user direction): TRND $250/mo.** Pro must sit above the baseline; the
  user named only the one number, so Pro is set at $500/mo (2× baseline; the old
  49→149 tripling felt steep at this altitude). Landing pricing copy reframed from
  "$30 a day of ad spend" math to "pays for itself with one landed campaign," which is
  the honest claim at $250 in high-LTV verticals. Playbook updated to match.
- **The read on a pick is model-only; the insight lines are the fallback.** The
  deterministic insight/how-to text is already the keyless read — a second templated
  paragraph would say the same thing in more words. So `pick_reads` is written only when
  Gemini is keyed (at rank time for the top 3, self-healed on the dashboard), cached per
  opportunity, and keyed on a fingerprint of the facts it was written from: a read whose
  facts moved is rewritten, never shown stale.
- **Ask lives on the pick, and an answer can steer the build.** The page-level Ask stays
  for market/money questions; the hero gets its own box seeded with pick-specific
  questions. A question that asks to run the pick differently comes back with a one-line
  `direction`, which the build prompts treat as outranking the judge's taste but never the
  menu. Rebuilds rewrite the campaign in place (same id — links and results keep pointing
  at it) and refuse once it has launched: launched campaigns are the record.
- **The week's ad is written without being asked.** The product is the finished ad, and
  the owner was having to click for it and wait a minute before seeing any value. The #1
  pick is now built by the Monday cron and self-healed by the dashboard after its
  response; a unique index on `campaigns(opportunity_id)` plus an in-process guard keep
  two writers from racing. Thin picks (below 4.3) and locked plans are never built unasked.
- **The hero is the ad; the evidence is one click down.** Hook, offer, audience, spend,
  in-feed preview, "Open the campaign" and "Not this one". The read, the insight lines,
  the grade and meters, the playbook and the rivals' ads all survive, under "Why this
  pick" — the front page no longer leads with what the tool doesn't know yet.
- **Three tabs.** This week, Campaigns, Settings. Results moved onto each campaign
  (the full roll-up stays at /app/results, linked from Campaigns); Report, Opportunities,
  Snapshot and Ask stay as routes linked from This week.
- **One plan, $149.** Rivals, the Monday email (which the cron already sent to everyone),
  and unlimited builds are in it. Pro is not sold; its plan id survives for any
  subscription that already carries it.
- **Evergreen means memory plus a question that never closes.** The reason a weekly
  read feels thin is that each week was computed fresh. Now every pick's facts, the Ask
  context, and the Monday note carry six weeks of what TRND noticed (rankings, passes,
  ads, results, rival moves), and the owner keeps up to five standing questions that the
  Monday cron re-answers with what moved. Both are read from tables that already exist
  plus one small new one; neither depends on a new signal source.
- **Thin signal is a keys problem, not a code problem.** Trends' unofficial endpoint
  cannot be the backbone; DataForSEO, YouTube, Places and Gemini keys are the fix, in that
  order. `GO-LIVE.md` is the founder's list; nothing on it needs a code change.
- **Uploads keep the facts, never the file.** No storage bucket, no retention question:
  a document is read once on upload (text and CSV deterministically; PDFs by the model as
  bytes), digested into ≤12 citable facts plus any priced items, and the raw bytes are
  dropped. The digest rides on the report, the pick facts, Ask and the Monday note. Not on
  the campaign prompts yet — the claims guard would strip numbers it can't trace to the
  menu, and document facts need their own allow-list first.
- **Professional means subtraction.** Five passes, each its own commit: (1) no plumbing —
  env names, the demo strip, keyless fallback strings and "illustrative" badges are gone from
  customer paths, and production never ranks or cites sample signals; (2) plain language —
  titles are nouns, buttons verbs, no arrows, no self-narration; (3) one typeface (Inter),
  sentence-case labels instead of mono caps, chips only for grade and delta, one bare-input
  class; (4) the landing page promises weekly, labels its examples, sells one plan; (5) This
  week is the ad, why, ask, standing questions, demand, next in line, competitors, calendar —
  market pulse, recent campaigns and the analysis teaser are cut. Every static inline style
  (510 of them) is now a Tailwind utility on the project's own tokens; only dynamic values
  stay inline. The project CSS sits in `@layer components` so utilities keep the precedence
  inline styles had.
- **Word and Excel uploads read on the server, keyless.** `mammoth` unpacks .docx to text;
  SheetJS turns every sheet of an .xlsx/.xls into CSV (the first sheet is the table the
  deterministic digest reads). Neither needs the model; PDFs still do.
