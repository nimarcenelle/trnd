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
- **The unit is a creative test, not a keyword (2026-09-15, advisor brief).** Search terms
  are research inputs; the pick carries a brief a creator can shoot from. Stored on the
  existing `picks` row (`brief` jsonb plus a few columns) rather than a new table, so the
  week job, runs, feedback and both repos keep working and older picks keep rendering as
  keyword picks. Nothing historical is relabeled.
- **Facts are checked, judgments are labeled.** "Every clause traces to a number" was too
  strict for creative reasoning and let a rival's ad read as proof. Now: factual claims
  must trace to the catalog, the owner's notes, documents or evidence rows; hypotheses are
  stored as written and labeled; unknowns stay unknown; numbers are never invented; an
  observation is never causal proof. Limit lines are code, never the model's.
- **Grades and scores off the page.** No calibration supports "A · Customer 84" as a
  probability. The internal score orders candidates; the page shows rank and reason.
- **No universal kill rule.** The evaluation plan is built from objective, baseline, spend
  and result volume, and says what is missing. Manufactured thresholds were the old default.
- **Three a week, fewer when thin.** A concept too close to an earlier one is dropped.
- **Statuses never collapse.** Chosen is not launched, launched is not successful, no result
  is not a loss, passed is not a failure. Cool-offs shortened (killed 14d, lost 21d, not now
  14d) and always say the topic comes back with a different concept.
- **Founder-assisted pilot replaces the self-serve trial as the funnel.** $500 for one month
  is a price hypothesis, not validated by ad spend. Landing CTAs go to the application; the
  trial and Stripe mechanics are untouched; `PILOT_INVITE_CODE` gates signup when set so a
  paid scan runs only for a brand the founder let in.
- **Admin fails closed in production.** With a real database and no `ADMIN_EMAILS`, nobody is
  an admin. The prospector is a legacy local-business tool: no schedule, sends on click only,
  and its page says it is outside the pilot funnel.
- **Provider spend is estimated and labeled.** `provider_usage` records every Apify and
  DataForSEO call with units and an estimate from a public rate (basis stated); no billed
  figure exists. Draft failures are recorded as failed rows without the draft.
- **The loop closes in code, not in copy (2026-09-17, advisor review).** The synced numbers
  go all the way to the run: live when the platform delivers, closed when the platform says
  ended, never a verdict and never a stopped run reopened. Lift is logged on the run when it
  ends, against the account with the run's own row left out, so the stamp is checked against
  results per grade instead of asserted. The concept is graded against the brand's last three
  ads of the same shape, and the line is written by code from the counts.
- **One Apify call, one meter.** The three paths that built their own actor URL now go
  through the shared call; three billing paths with no row was why the in-app cost read low.
- **Say only what ran.** Settings names the sources whose keys are set; a source that could
  run is not a source that did. The TikTok per-term read stays off the claim until one live
  run confirms the actor's fields.
- **No new sources.** Every change here is depth per brand: its own results, its own history,
  its own record. Not one new adapter.
- **Narrower and deeper: only the sold product is a route (2026-09-17, user direction).** The
  older keyword-pick and campaign-builder product came out whole: Opportunities, the weekly
  report, Ask, standing questions, the campaign builder and its Meta launch, the results
  roll-up, the pick reads, the styleguide and the dead landing sections. Their tables stay
  in the schema, unused. What is left is the pilot loop: invite, onboarding with an export,
  three briefs, choose, launch, record, the track record, and a Monday email that delivers
  the briefs instead of a ranked keyword report. The Monday cron no longer spends model
  calls on a note nobody was sold.
- **TRND never launches an ad.** The brief is handed to a creator and the ad runs in the
  brand's own Ads Manager. Results come back by name: the brief says what to call the ad
  (`TRND: <concept title>`), and every ad-history row that carries it, synced or uploaded,
  is summed onto the test. The sync never closes a run; the owner's "mark completed" does,
  with the synced numbers already filled in and never erased by a blank.
- **OpenAI replaces Gemini (2026-09-19, user direction).** One adapter file, two tiers pinned
  by env or resolved from the account's model list, reasoning models tuned by effort not
  temperature. The hand-built response schemas are gone: the Zod schema a reply is validated
  with is turned into the strict JSON Schema the model is held to, so there is one shape per
  call and a rejected reply is asked for once more with the rejection in the prompt.
- **Charge on access; measure what we control.** Three plans metered on briefs a week, rivals
  and seats; every plan carries the whole product. Because TRND cannot control the shoot, a
  finished ad is checked against its brief and the record counts tests that followed the brief
  apart from tests that strayed: a lost test says whether the idea or the shoot lost.
- **The record reads the whole account, not only TRND's tests.** Every ad-history row is
  classified by angle, opening and format on arrival, so the Track record can say what each
  angle does for the brand on cost per purchase from day one, and one bad shoot never decides
  a read.
- **The brief dictates its first three seconds and directs the rest.** On an access model
  TRND carries no outcome liability, so the caution that kept lines out of the brief cost
  usefulness. The opening beats are validated by the same fact rules as everything else.
- **Results by id outrank results by name.** A media buyer who did not follow the naming
  convention can point the test at its ad from Campaigns; the link is keyed on the platform's
  ad id so a resync keeps it.
- **A brand is a team, and a brief leaves the building.** Members see the brand through the
  same row security the owner does (owns_business includes members); the business row and the
  roster stay the owner's. A creator who will never log in gets a share link.
- **X stays; the local-era sources go.** Weather, news counts, the Instagram hashtag adapter
  and the stock seasonal calendars were reads for a local business. X is kept as the national
  conversation read (user direction).
- **The teardown is the pitch.** A prospect's site is read the way a signup's is, into a
  shadow brand the founder owns and no cron touches, and the email quotes the strategist's
  read or says plainly that there was not enough to read.
- **The store's own numbers over the crawl's.** A Shopify custom app token, pasted by the
  owner, gives the catalog its costs, variants and stock and the dossier its orders and live
  codes; no OAuth app, no review. An offer test now knows the margin and the codes.
