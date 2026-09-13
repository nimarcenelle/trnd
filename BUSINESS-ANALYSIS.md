# TRND — Business analysis: is it sellable?

Written 2026-09-13 against commit `d75eaba`. Sources: the repo (code, migrations, tests,
`BUILD_LOG.md`, `DECISIONS.md`, `BLOCKED.md`, `GO-LIVE.md`), a fresh install with the unit
suite, typecheck and lint run, and public pricing of the closest competitors.

---

## Verdict

**Not sellable today as a $500/month self-serve subscription. Sellable within 6–10 weeks as
a paid pilot to five design-partner brands, and sellable as a subscription only after
those pilots produce a measured result.**

The short reason: TRND sells a *decision* ("run this ad next"), and there is not yet one
piece of evidence that the decision is right. No business has paid, no campaign result has
been recorded, the learnings table that the whole moat rests on is empty, and every dry run
on a real brand in the build log found the top pick was wrong in some way before the fix
that followed. The engineering is unusually complete for its age; the business is at zero.

What is genuinely strong:

- **The product idea is correct and well-scoped.** "What ad to make next, with the bet and
  the kill rule" is the question growth teams ask every Monday. Nobody in the competitive
  set answers it as a single call; they hand over libraries and dashboards.
- **The build is real, not a demo.** ~55k lines of TypeScript, 25 migrations with row-level
  security on all 31 tables, 792 passing unit tests, clean typecheck, 6 crons, Stripe
  checkout and webhooks, Gemini behind one schema-validated wrapper, and a resumable weekly
  job. This is a working system, not slideware.
- **Honest scoring design.** Low-confidence signals are excluded from the grade rather than
  averaged in as a fake 50; a Hold never becomes a campaign; picks with a broken metric stay
  drafts. That discipline is rare and is the right foundation for a trust product.

What blocks a sale, in order of severity:

1. **Zero proof.** No customers, no results, no case study, an empty learning loop.
2. **Positioning whiplash.** The code, docs and pricing disagree about who the customer is.
3. **The signal supply chain is fragile and partly illegitimate.** Free sources are dead
   from datacenter IPs; the rest are scrapers or unverified paid actors.
4. **Priced above better-proven competitors** with less data and no ad-account integration.
5. **Not operable as a business yet.** No CI, no error tracking, no cost cap, admin fails
   open, migrations pasted by hand, one author.

---

## What TRND is, as built

An AI creative strategist. Onboarding crawls the brand's site and catalog, writes a founding
analysis and a watchlist of customer search phrases. Daily crons read demand signals
(search, short-form video, competitor ads, social posts, weather for local businesses).
Every Monday a job grades opportunities on four signals (Customer 35, Brand 25, Culture 20,
Competitive 20), writes five picks, each with one metric, a bet sized from the brand's ad
spend, a kill threshold, three scripts, and evidence, then emails the top call. The owner
runs it, records or syncs results, and the results feed next week's Brand signal.

The stack is Next.js 16, Supabase, Stripe, Gemini (Flash and Pro resolved at runtime),
Apify actors for Instagram, TikTok, Facebook and the Meta Ad Library, and Vercel crons.

---

## Scorecard

| Dimension | State | Grade |
|---|---|---|
| Problem and promise | Sharp, specific, correct question | A |
| Engineering completeness | Production-shaped, tested, type-clean | A- |
| Evidence the picks are right | None recorded; every real-data dry run found a wrong #1 before a fix | F |
| Customer definition | Flipped local SMB → DTC on 2026-09-12; code is still mostly local-first | D |
| Data supply | Free sources blocked in prod; paid backbone (DataForSEO) not yet keyed; scrapers | D+ |
| Defensibility | Claimed moat is results data; the table is empty and account sync needs Meta App Review | D |
| Pricing and packaging | $500 flat, no card at trial, paywall gates only campaign builds | C- |
| Go-to-market | Landing page, demo form, founder alerts, cold-email prospector; no pipeline | D |
| Operations | No CI, no error tracking, no LLM spend cap, hand-pasted migrations, bus factor 1 | D+ |
| Legal exposure | Cloudflare-waiting headless scrapes, unofficial Google endpoints, cold email | C- |

---

## 1. Zero proof, and why that is fatal for this particular product

TRND's pitch is that a $50k/month brand should trust a weekly call over its own gut. The
only thing that sells that is a record: "we told brand X to run Y, they did, and it beat
their median CPA." Today:

- `campaign_results` and `pick_runs` have never held a real row. The learnings that feed
  the Brand signal are seeded priors labeled illustrative.
- The Meta results sync (`app/api/cron/sync-results`) is a no-op until a Meta app passes
  App Review for `ads_read`, which has not started. Until then results are typed in by hand,
  which the go-live doc itself calls "where owners drop."
- The build log's own real-data runs (Bellwood, eskiin, caffedriade) each surfaced a wrong
  top pick: a 110-search-a-month bean matched to a $400 brewer; "+200%" on 688 views;
  "+1,417,664%" from a mislabeled series; every eskiin term reading "holding steady." Each
  was fixed. The pattern says the next real brand will surface the next one. That is normal
  for a system this young, and it is exactly why it cannot be sold blind.

**Until three brands have run a TRND pick and reported a number, the product is a
hypothesis. Price it as one.**

## 2. Positioning whiplash

Three customers live in the repo at once:

| Surface | Customer | Price |
|---|---|---|
| `README.md`, `PRODUCT.md`, brief | Local SMB (restaurants, salons, HVAC) | $149/mo |
| `DECISIONS.md` (mid-history) | Same, repriced | $250/mo, Pro $500 |
| `app/page.tsx` (current landing) | DTC brands spending $20k–$250k/mo on paid social | $500/mo, $5k/yr |

The pivot to DTC happened on 2026-09-12. The code underneath is still local-first by
weight: DMA metro resolution, Open-Meteo weather triggers, menu-PDF parsing, Google Places
rival discovery, "$25 a day" budget framing in prompts. The DTC path is a `market = online`
flag that turns those off and reads demand nationally. That is fine as a start, but it means
the DTC product has *less* signal than the local one, at three times the price.

Both markets are viable; they are different companies:

- **Local SMB at $149:** enormous market, brutal economics. Owners do not run ads from a
  paste-into-Ads-Manager CSV, churn is high, willingness to pay for "strategy" is low, and
  the fix (one-click launch via Meta API) needs the same App Review. Support cost per
  dollar is the worst in SaaS.
- **DTC at $500:** budget exists and the buyer already pays for tools in this range. But it
  is the most crowded creative-tooling market there is, and the buyer will benchmark TRND
  against Atria, Motion and Foreplay on day one.

The founder chose DTC. That is defensible, and this analysis assumes it. The cost of the
choice is that the local-specific machinery (roughly a third of `lib/`) becomes dead
weight, and the docs, README pricing table, prompts and onboarding copy all need to say one
thing. A buyer who reads "$149 for restaurants" in the README and "$500 for DTC" on the site
concludes the company does not know what it sells.

## 3. The signal supply chain

`BLOCKED.md` is candid, and the picture it paints is that the free signal layer does not
work in production:

- Google Trends unofficial widget endpoints: 403 from datacenter IPs.
- Reddit anonymous JSON: returns HTML from datacenter IPs.
- TikTok Creative Center: three rows per query, no paging, national only.
- X: paid tier only, free tier returns 402.
- Instagram Reels: needs App Review; adapter exists, dark.
- Meta Ad Library and Google Ads Transparency: read by headless Chromium as "the public
  page, no login"; the Ad Library path does not run in serverless and falls to an Apify
  actor.
- Site import: a headless renderer that deliberately waits out Cloudflare's JS challenge
  (`lib/import/render.ts`).

So the production ranking rests on DataForSEO (not yet keyed), YouTube (free, not keyed),
and Apify actors for the social and rival reads (per-result billing, never run live, field
names unverified). The Customer signal, weighted 35%, is therefore currently thin or empty
in prod, and the four-signal model will grade most brands on one or two signals with the
weights redistributed. The model handles that honestly, which means the honest output is
"we don't know much yet," which is not what a $500 buyer is paying for.

Two consequences:

- **Operational:** signal thickness is a keys-and-spend problem, as `GO-LIVE.md` says, and
  the keys are cheap. But the first-week experience for a paying brand depends entirely on
  whether those keys are set, and none are.
- **Legal:** scraping around Cloudflare and hitting unofficial Google endpoints is
  tolerated until it isn't. It is also the kind of thing a diligence checklist flags. For a
  DTC product the customer's own connected ad account is both the legitimate and the
  richest signal, and it is the one input that competitors cannot copy per-customer. That
  is where the data effort should go, not into more scrapers.

## 4. Competition and price

The "what creative next" space is occupied, and the buyer knows the names:

| Tool | What it does | Price (public, 2026) |
|---|---|---|
| Atria (Radar, "Raya" strategist) | Recommends the next creative iteration from a 25M-ad library and $5B of tracked spend; Meta and TikTok | ~$129/mo annual entry; Plus from ~$479/mo |
| Motion | Creative analytics and reporting on the connected ad account | ~$99/mo solo; $250–500+/mo scaled by spend |
| Foreplay | Swipe file and ad discovery, 500k+ ads | $59 / $175 / $459 per month |
| Meta Ads AI Connectors (open beta, Apr 2026) | Manage, analyze and build campaigns through AI agents inside Meta | Free with the platform |

Against that set TRND is priced at or above the top tier of each with no ad library, no
ad-account integration, and no proof. Its actual differentiators are real but unproven:
the *single weekly call* format (a decision, not a dashboard), the bet and kill rule,
scripts written against the brand's real catalog and price, and demand signal from outside
the ad platform (search, short-form, weather, rivals). Those are worth $500 if they work.
Nobody outside the founder has seen them work.

Meta's own AI connectors also compress the space from below: "analyze my account and
suggest the next ad" is becoming a platform feature. The defensible layer is the one Meta
will not build: cross-platform demand outside its walls, and a strategist voice the brand
trusts.

## 5. Operability

Verified on a fresh clone today:

| Check | Result |
|---|---|
| `pnpm install` | Clean, 8 seconds |
| `pnpm vitest run` | 792 passed, 2 skipped (live RLS, needs creds), 77 files |
| `npx tsc --noEmit` | Green after `next typegen`; fails without it (Next 16 generated `PageProps`) |
| `pnpm lint` | 2 errors (`any` in two `scripts/probe-*.ts`), 3 warnings |

What a buyer, an investor, or a second engineer would flag:

- **No CI.** No `.github/`, no PRs, no branch protection. Green-before-commit is a habit,
  not a gate.
- **No error tracking or metrics.** Zero Sentry, PostHog or OpenTelemetry. A cron that
  silently writes nothing on Monday is invisible until a customer emails.
- **No LLM cost ceiling.** Pro-first creative calls with retries, roughly five model calls
  per brand per week plus daily intel notes, Ask answers and document digests; no token
  cap, no per-tenant metering, no monthly budget. A single brand with a long Ask session
  can cost more than it pays.
- **Admin fails open.** `/admin/prospector` is reachable by any signed-in user if
  `ADMIN_EMAILS` is unset.
- **Paywall gates only campaign builds.** Picks, evidence, scripts, exports and Ask stay
  open after trial expiry, by design. In the DTC framing the pick *is* the product, so the
  trial never really ends.
- **Migrations are pasted into the Supabase SQL editor by hand**, and `.env.example` is
  missing nine variables the code reads (DataForSEO, Places, Meta app, Jina, Google Ads,
  `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`).
- **Bus factor is one**, and the codebase was built largely by an agent across ~28 passes
  in a few days. That is a strength for speed and a weakness for anyone who has to
  maintain 31k lines of `lib/` without the session transcripts.
- **Docs drift.** README says 109 tests and $149; there are 792 and $500.

## 6. Unit economics at $500/month

Rough per-brand monthly cost of goods, assuming keys are set and the brand has five direct
rivals:

| Item | Estimate |
|---|---|
| Gemini (Pro for scripts and reads, Flash elsewhere; ~5 calls/week + daily intel + Ask) | $5–25 |
| Apify social reads (brand + 5 rivals, 3 platforms, every 48h, per-result billing) | $15–60 |
| Apify Meta Ad Library reads by Page | $5–20 |
| DataForSEO search volume for 5–8 watch terms daily | under $2 |
| YouTube, Places, Open-Meteo, Resend | ~$0 at this volume |
| Vercel and Supabase share | $2–10 |
| **Total** | **~$30–115 per brand per month** |

Gross margin is fine (75–90%) if the Apify reads are capped, which they are (48-hour
refresh, direct rivals only). The problem is not margin; it is acquisition. Brands spending
$20k–$250k/month are reached through founder networks, agencies and communities, not
through a self-serve "Start free, no card" button, which mostly attracts tire-kickers who
never connect an account. The prospector tool aims at local businesses via Google Places
and cold email, which is the *old* customer, and carries CAN-SPAM exposure (no physical
address or unsubscribe link enforced in the send path).

## 7. Is the code itself sellable as an asset?

No. Acquirers in this space pay for customers, retention and proprietary data. TRND has
none of the three. A large, agent-generated codebase with zero users has near-zero
standalone resale value, and a buyer would rebuild rather than inherit it. The asset worth
building is the results ledger: brands, picks, what ran, what it returned.

---

## What needs to change

### Horizon 0 — this week: decide and reconcile

1. **Commit to one customer in writing.** DTC brands with $20k–$100k/month on Meta and
   TikTok and no in-house creative strategist. Update `README.md`, `PRODUCT.md`, the
   onboarding copy, the prompts' budget framing and the prospector's discovery source to
   match. Delete or archive the $149 and $250 references.
2. **Set the keys.** Gemini, DataForSEO, YouTube, Resend, `CRON_SECRET`, `ADMIN_EMAILS`.
   `GO-LIVE.md` already lists them; nothing here needs code. Run one full week on a real
   brand in production and read every pick as the buyer would.
3. **Start Meta App Review now** for `ads_read` and `ads_management`. It takes weeks, it
   gates both the results loop and one-click launch, and it works immediately for test
   users, which is enough for the pilot.

### Horizon 1 — weeks 2–8: prove it with five brands

4. **Run a paid pilot, not a free trial.** Five brands, $250/month or free in exchange for
   a signed results-sharing agreement, six weeks, founder on a weekly call with each.
   Success metric per brand: at least one TRND pick ran, and its CPA or ROAS beat the
   brand's trailing median. Record everything in `pick_runs`.
5. **Make the connected ad account the primary signal.** Once tokens exist, pull 180 days
   of ad-level history (the code is written), let the Brand signal read from it, and have
   the weekly call cite the brand's own winners. This is the input Atria cannot see
   per-customer and Meta will not combine with outside demand.
6. **Kill what does not survive contact.** After five brands, every source that never
   contributed to a pick that ran should be removed or left dark. Expect the weather,
   menu-PDF and DMA machinery to go on the shelf for the DTC product.
7. **Instrument.** Add Sentry (or equivalent), a per-tenant LLM token ledger with a monthly
   cap, and an alert when the Monday job writes zero picks for any brand.

### Horizon 2 — weeks 8–12: package and sell

8. **Pricing:** keep one plan, but require a card at trial or replace the free trial with a
   "first call free" that ends in a checkout. Consider spend-tiered pricing like Motion so a
   $20k brand pays $250 and a $150k brand pays $750. Lock in a founding rate for the pilot
   brands in exchange for a case study.
9. **Gate the pick after trial.** The pick is the product; a lapsed account should see last
   week's call and a checkout, not this week's.
10. **Replace scrapers with licensed reads.** Apify actors for the Ad Library and social are
    acceptable; the Cloudflare-waiting renderer and unofficial Google endpoints should be
    behind a flag that is off in production. Add a physical address and unsubscribe link to
    every prospector email, or retire the tool.
11. **Ops hygiene for a second person:** GitHub Actions running lint, typegen+tsc, and
    vitest on every PR; `supabase db push` in a deploy step; fill in `.env.example`; fix
    the two lint errors.

### The bar for "sellable"

TRND is sellable as a subscription when all of these are true:

- Three or more brands have run a TRND pick through a connected Meta account and the
  result is recorded in the product.
- At least one of those beat the brand's median ad, and the brand will say so publicly.
- Weekly open rate of the Monday call across pilot brands is above 60%.
- The signal keys are set in production, the crons have run for four consecutive weeks
  without a silent failure, and error tracking exists to prove it.
- The docs, landing page and onboarding describe one customer at one price.

Until then, sell the pilot. The product is close enough that five brands will say yes to
"I'll tell you what ad to run next week; if it doesn't beat your median, you pay nothing."
That sentence is the sales pitch, and the code is already built to back it. What is
missing is the evidence, and only customers can supply it.

---

## Competitor pricing sources

- Atria: https://www.tryatria.com/ and https://www.tryatria.com/blog/best-ai-ad-tools-for-creative-analysis
- Motion and Foreplay pricing: https://adlibrary.com/posts/motion-vs-foreplay and https://adlibrary.com/posts/foreplay-alternatives-2026
- Meta Ads AI Connectors: https://spreshapp.com/article/meta-replaced-foreplay-motion-atria
