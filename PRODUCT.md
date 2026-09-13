# TRND — What the product does

**One line:** TRND tells a direct-to-consumer brand what to advertise next, why now, and
hands it the finished creative — then learns from what its ad account actually returned.

Everything hangs off five steps: **Detect → Match → Position → Launch → Learn.** The app
reads demand in the brand's category and among its customers, matches it against what the
brand actually sells, builds the creative, helps launch it, and learns from recorded
results. Every screen is one of those steps. It is decision replacement, not decision
support — not a dashboard of mentions.

**Who it is for.** One customer: a DTC brand where paid social drives growth, spending
roughly $20K–$150K a month, with no in-house creative strategist. The buyer is the person
who has to answer "what do we make next?" every week and is answering it from instinct.

**The local path still exists.** Every business carries a `market` flag (`online` or
`local`, `lib/db/types.ts`). The local machinery — city → Nielsen DMA metro resolution,
Open-Meteo weather triggers, menu-PDF reading, Google Places rivals and review mining — is
in the code and runs for any business flagged `local`. Nothing was deleted. It is simply
not the path the DTC customer takes: an online brand is read nationally, against competing
brands, with no metro and no weather. Each section below says which path it describes when
they differ.

---

## The customer's journey

### 1. Landing page (`/`)
Marketing site in the brand system, written for one reader — the growth team at a DTC
brand: hero, the problem ("you spend tens of thousands a month on ads and picking the next
one is still a guess"), the four signals (customer, culture, competitive, brand), the
six-stage loop, a labeled example of a weekly call, the pricing band (the founding rate for
the first ten brands, the standard rate after it, the guarantee, and the 14-day no-card
trial — all printed from `lib/billing/index.ts`), and a demo-request form. The example
brand on the page is invented and says so. Footer links Terms and Privacy. Two funnels:
**Start free** → signup, and the demo form — which writes to the database *and* alerts the
founder on Slack/email the moment a lead lands (as does every new signup). The older
landing components that still carry local-shop copy (Ticker, Steps,
ProductFrame) are left off this page rather than contradicting it.

### 2. Signup & auth (`/signup`, `/login`, `/forgot`)
Password auth, plus magic links when Supabase is configured. Forgot-password sends a
recovery email that lands on `/auth/reset`. Signup carries a Terms/Privacy consent line.
Without Supabase keys, demo-mode auth (scrypt-hashed passwords, HMAC-signed session
cookie) provides the identical flow.

### 3. Onboarding (`/onboarding`)
The wizard leads with the brand's website: it crawls the homepage, the pages its nav links,
and the pages its sitemap lists that the nav never mentions, pulls the online catalog from
Shopify/WooCommerce, reads any priced menus or price lists it finds, and extracts name,
category, location, priced offerings, brand voice, social handles and photos (JSON-LD,
price-line heuristics, headless render for JS-only sites, Gemini refinement when keyed) —
then collapses everything into one confirm screen. No website, or a blocked crawl → five
short steps. The steps differ by market: an online brand gets **Website, Category, Ads,
Products, Voice**; a local business gets **Website, Category, Location, Services, Voice**.

The Ads step is the DTC step: monthly paid social spend band (under $20K, $20–50K,
$50–100K, $100–250K, $250K+) and the platforms it runs on (Meta, TikTok, Google, YouTube,
Pinterest, Snapchat). The spend band is not decoration — it sizes every test budget the
product later recommends. The Location step, the radius and the price band belong to the
local path, and the market decision itself is one function (`lib/onboarding/market.ts`):
no street address means online, and a storefront category ("café", "salon", "HVAC") on a
site with an address means local. It is editable later in Settings.

Up to five documents can be read during onboarding; the rest of the limit lives in
Settings. Finishing:
- starts the **14-day trial clock**,
- redirects instantly to `/app/picks`,
- writes the founding analysis in the background,
- kicks the week job, which runs the market scan, the rival read, the ranking and the
  picks one stage per invocation (`lib/picks/advance-week.ts`) — five to eight minutes of
  work no single request would survive,
- fires a founder signup alert.

### 4. The founding analysis (`/app/snapshot`)
Minutes after joining, the brand gets its full read: positioning, customer segments,
market context, pricing read, seasonality, strengths, moat, watchouts, concrete first
moves, a named target customer with their own vocabulary and the places they post — and a
**watchlist of search phrases its real customers use** (4–30 from the model; the keyless
version caps at 20), which then drives its personalized signal ingestion. Model-written
when Gemini is keyed; a category-informed deterministic version otherwise, and an analysis
written by an older prompt or by the template is rewritten in the background once a key
lands. When the analysis changes, the week's ranking rebuilds against it.

### 5. This week (`/app/picks`) — the product
The week is a **ranked list of picks**, each one its own page. `/app` is the door and
redirects here; an old `?pick=n` link resolves to that pick's page. Above the list sits one
alert line when something moved since the last visit (a rival's new ad, a term breaking
out) and nothing when nothing did. While the week is still being built, the page shows
what stage it is on and polls itself.

**One pick, whole** (`/app/picks/[id]`):

- **The finding** — what is happening, in the customer's own words, quoting the term. It
  never prints the metric; the page shows that once, next to it.
- **The Opportunity Grade** — a letter and a 0–100 score on the four signals below, with
  a confidence on each. A low-confidence signal is left out of the grade and its weight
  goes to the others; it is never averaged in as a credible-looking 50, and the page says
  which signal sat out and why ("Competitive wasn't factored in: no competitors connected
  yet") with a link to fix it.

| Signal | Reads |
|---|---|
| **Customer** | What the target customer is searching and saying: volume, intent, velocity |
| **Culture** | Short-form momentum, seasonal timing, where the format sits in its lifecycle |
| **Competitive** | What the direct rivals are running: whitespace, saturation, weakness |
| **Brand** | What this brand sells and what has actually worked for it: past ads, own posts, category learnings |

- **The demand read** — the measured series behind the term, its week-over-week delta, and
  where it was measured (national for an online brand, the metro for a local one).
- **The bet** — what to spend, how long to run it, and the number that ends it. Computed,
  never model-written: for an online brand, a 5-day test at 5% of its spend band's monthly
  floor; for a local business, six days at the price band's daily rate. The kill rule uses
  the best evidence available — the account's own cost per purchase from connected or
  imported history, its cost per click otherwise, and the category click-through benchmark
  when there is no history at all — checked by day three.
- **Three scripts** — each with a thesis, a hook, what to show, what to say, what to prove,
  a CTA and a duration. Shoot-ready for a team or a creator.
- **Why** — the evidence behind each signal, the rivals' current ads, and the guardrail
  (the thing not to do on this pick).
- **Two decisions** — run it, or dismiss it with a reason (wrong customer, already tried,
  off-brand, can't shoot it, other) plus an optional note. Both are memory: they shape
  later weeks. Copy-all and an export live next to them.

A lapsed account keeps the finding and the grade and loses the rest — the bet, the scripts
and the evidence are what the plan buys.

**Ask** (`/app/ask`) answers market and money questions from the same facts the weekly
report is built on — rivals' reads, reviews, services, campaigns and the facts taken from
uploaded documents.

**Standing questions** are the ones worth re-answering forever ("Who is advertising against
us this week?", "Is our hero SKU priced right?"): up to five, re-answered by the Monday
cron against that week's facts, each
with one line on what moved since the last answer. They ride in the Monday email today —
the in-app panel (`components/app/standing-questions.tsx`) is not wired into any screen
since the picks rebuild, so email is currently the only place a brand sees them.

**Memory.** Every pick's facts, the Ask context and the Monday note carry what TRND
remembers about this brand over the last six weeks — weeks a term was ranked, dismissals,
the creative run on it and what it returned, rival ad counts moving — so week six reads
differently from week one by construction (`lib/recommend/history.ts`).

**Navigation is four tabs** — This week, Campaigns, Snapshot, Settings. The older screens
survive as routes but are reached sideways: the weekly report from the empty state of This
week and the analysis from Settings, the full ranking from the analysis, the results
roll-up from Campaigns and from each campaign. `/app/ask` currently has no link in the
shell at all — it is reachable only by URL.

### 6. Opportunities (`/app/opportunities`)
The week's full ranked list, linked from the analysis — one row each with the term, its
week-over-week delta and metric, the matched product, and an expandable "why it ranked"
holding the insight lines, the 30-day demand sparkline and the source badge for the row's
provenance. Build a campaign from it, or dismiss it.

### 7. The campaign (`/app/campaigns/[id]`)
One click on **Build the campaign** streams generation progress and produces the full
package:

1. **Creative** — three static creative briefs (using the brand's own site photos when
   harvested) plus three 15–30s video scripts, written to the length that is winning on
   the term when the short-form read knows it.
2. **Copy** — five headlines, three primary texts with an in-feed ad preview, and landing
   copy.
3. **Targeting and budget** — audience, age range, geography, budget sized to the spend
   band (or the price band on the local path), a flight plan with a kill rule.
4. **Launch** — checklist, copy-all, JSON download, **CSV formatted for Meta Ads Manager**,
   "mark as launched", and — when the Meta app is configured and the brand's ad account is
   connected — **Launch to Meta (paused)**, which creates the campaign in their own account
   for them to review and switch on.

All copy is brand-voiced, priced from the real catalog, and category-correct. Gemini-
generated with schema validation when keyed — three routes into the demand (the thing, the
moment, the person), a judge, the assets, then a copy chief's pass that rewrites any line
a person wouldn't say out loud — and a deterministic brand-voiced generator otherwise. A
build steered from an Ask answer carries that direction into every call: it decides which
product, offer, audience or angle leads, and can never add a promise the catalog doesn't
list. Rewrites keep the campaign's id, so links and results still point at it; a launched
campaign is never rewritten.

### 8. Results — on the campaign, and the flywheel (`/app/results`)
Once a campaign is marked launched, a **Results** step appears on the campaign itself: a
manual entry row (impressions, clicks, spend, bookings, revenue) and that campaign's
history. With a connected Meta account the daily sync fills this in without anyone typing:
`/api/cron/sync-results` pulls platform insights for every launched
campaign, then pulls the account's own ad history so the Brand signal stays current
(`lib/ads/sync.ts`, `lib/ads/history-sync.ts`). Brands with no connection can upload a
Meta or Google Ads export (CSV or Excel) in Settings and get the same read.

`/app/results` rolls everything up: CTR against an illustrative category benchmark, cost
per result, ROAS, a one-line takeaway, a CTR-by-campaign chart, the full history, and the
**learnings panel**: every recorded result updates category-level lift by persuasion angle,
which feeds the Brand signal in next week's scores. Seeded priors are dashed and labeled,
and the first real result *replaces* them — truth is never blended with sample data.

### 9. Settings (`/app/settings`)
Business profile, market (online brand or local business), monthly spend band and
platforms; services or products (add / price / activate / deactivate / remove);
**Your documents** — upload a price list or menu (PDF or Word), a sales or POS export
(Excel or CSV), brand notes, past ad results, or paste text. TRND reads it once (the model
reads PDFs; Word, Excel, CSV and text are read on their own), keeps the facts and never
the file, and cites them in every pick's read, every Ask answer and the Monday note. A
document that lists priced items offers one click to add them to the catalog — the contract
every campaign is written against. Up to ten documents, 8 MB each. **Your past ads** —
upload an ad export and TRND reads the account's click rate, its best ad and which themes
beat its own average. **Competitors** — the rivals watched daily; on the local path
"Find nearby competitors" uses Google Places. **Plan and billing** — trial countdown,
Stripe checkout, customer portal, or a plain explanation of which env keys switch billing
on. **Account** — change password, typed-DELETE account deletion with full data cascade.
**Integrations** — what is live vs dormant, including Connect Meta.

---

## Behind the scenes

### Detect — daily cron + `pnpm job:ingest`
Fourteen adapters behind one interface, each with a timeout, exponential-backoff retry, and
a circuit breaker — the job succeeds on partial results, and one dead source is a logged
warning, never a failed run. The run has a wall-clock budget and adapter order is priority:
anything left when the budget runs out is skipped loudly, by name, because a silent skip is
an outage nobody sees.

- **DataForSEO** — real monthly search volume and week-over-week deltas per watch term.
  First in the order: the demand score anchors every Google Trends index to real volume, so
  without it Trends contributes nothing
- **YouTube Data API** — Shorts reads per watch term (key-gated)
- **Apify TikTok actor** — per-term TikTok reads (paid, key-gated)
- **TikTok Creative Center** — trending hashtags by industry (unofficial, national)
- **Instagram** — Reels per hashtag (key-gated, needs App Review)
- **X recent search** — the written half of the conversation (paid tier)
- **Google Trends RSS** — national movers, keyword-classified into categories
- **Weather triggers** — *local path only.* Open-Meteo forecasts (keyless) per place;
  deterministic rules that fire only when the forecast crosses a line the recent past
  didn't. Deltas labeled heuristic, framed as forecast-derived
- **Google Autocomplete** — keyless buying-intent reads per watch term ("near me," "cost,"
  "best") plus long-tail discoveries
- **Reddit** — category and customer subreddits, weekly top conversation
- **Google News RSS** — corroboration / coverage counts
- **Meta Ad Library** — real competitor ad-saturation counts per ranked term
- **Google Trends interest-over-time** and **rising related queries** — last, where a
  failure of an unofficial endpoint costs least. Measured **per metro** on the local path
  (city → Nielsen DMA code, top ~50 US metros, suburb aliases, state-verified);
  nationally for an online brand

Every brand's watchlist personalizes what gets watched. An online brand's rivals are found
rather than looked up: the model proposes competing brands, each is verified against the
live web before it is watched (the site must load, handles come from the site's own links,
the Meta Ad Library says whether they are advertising now), marketplaces and retailers are
excluded, and the five most direct are kept (`lib/intel/discover-brands.ts`).

### Match & score — weekly cron + on-demand
The week is ranked by the **Opportunity Grade** (`lib/scoring/model.ts`). Each signal is
scored as a percentile against a rolling baseline for this brand — 100 is the strongest
reading seen recently, not an absolute — and carries a confidence:

```
grade = 35 × customer + 25 × brand + 20 × culture + 20 × competitive
        (low-confidence signals drop out; the remaining weights are renormalized)
```

Sub-weights are stated in the same file: customer = volume 40 / intent 35 / velocity 25,
culture = growth 40 / seasonal 30 / lifecycle 30, competitive = whitespace 45 /
saturation 30 / weakness 25, brand = similarity 40 / economics 30 / organic 30. Fewer than
eight baseline readings and a percentile is noise, so it is marked low confidence rather
than printed.

`lib/scoring.ts` holds the older component formula (momentum, fit, competitor gap,
historical lift) and the four-signal blend that decides which terms reach the judged
candidate pool. That is also where the gates live: the **relevance gate** — a concept judge,
deterministic always, Gemini-refined when keyed — re-judges fit against what the brand
actually sells and scales the total by it, so a mismatched trend can never ride momentum to
#1. Evidence gates cap the rest: a read below the regional meter keeps its fit but lands as
a B or C, and a national conversation read (a loud holiday, a national hashtag board) is
capped below the A band, because a holiday is a timing input for an offer, never the offer
itself. Local reads earn a transparent locality bonus. Every score renders its reasoning in
plain English; low-fit picks say "outside your lane" rather than dressing up as
opportunities.

### Learn
`lib/results/compute.ts` maps recorded results to a 0–1 lift per persuasion angle
(education, offer, scarcity, social proof, speed, novelty), blended by sample size into
category × geo learnings with provenance — the moat's data layer. `lib/ads/history-read.ts`
reads the brand's own account the same way: its cost per result, its best ad, and which
themes beat its own average, which is what the Brand signal and the kill rule are built
from.

---

## Pricing & plans

One plan, two rates. The product has no track record yet — a brand cannot check TRND's
calls against anyone else's results — so the founding rate buys the first ten brands'
patience and the guarantee carries the risk that proof normally would.

| Plan | Price | What it is |
|---|---|---|
| Free trial | 14 days | Full product, no card required |
| **TRND — founding** | **$250/mo or $2,500/yr** | The first 10 brands. Locked for life while the subscription stays continuous |
| **TRND — standard** | **$500/mo or $5,000/yr** | The rate after the founding cohort closes |

**The guarantee:** run a TRND call inside the first 30 days of paying, and if it does not
beat the brand's own trailing median cost per result, that month is refunded. Honoured by
hand in Stripe — an automated refund path would need a results feed that only exists for
connected ad accounts.

What the plan buys, in one list (`BASELINE_FEATURES` in `lib/billing/index.ts`): the next
ad to run every week with the product, angle, format, audience and three scripts; the four
signals behind it with every number linked to its source; direct competitors' Meta and
TikTok ads and posts read daily; learning from the connected ad account and past exports;
the Monday brief by email; and the founding analysis.

Every price above is read from `lib/billing/index.ts`, so the landing page, the settings
panel and the terms cannot drift apart. The Stripe price id itself is an env var
(`STRIPE_PRICE_BASELINE`): point it at the founding price now and the standard price when
the cohort closes, and no code changes. The creative generated is the customer's — export
works on every plan, trial included. An expired trial (with billing live) gates *new*
builds only; nothing already generated is ever held hostage, and nothing locks at all until
Stripe keys exist. `past_due` keeps working while Stripe retries the card. The `pro` plan
id survives in code for any subscription that already carries it and prints the standard
rate; it is not sold as a separate tier.

## Modes & infrastructure

With **zero env keys** the whole product runs in a loudly-labeled demo mode: local seeded
store, local auth, template generation, dormant billing. Each key switches its subsystem
on independently — no code changes:

| Key(s) | Switches on |
|---|---|
| Supabase URL + keys | Postgres with per-business RLS + Supabase Auth |
| `GEMINI_API_KEY` | Model-written analysis, judged rankings, written picks and campaigns |
| `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` | Real search volume per watch term — the demand backbone |
| `META_APP_ID` + `META_APP_SECRET` | Ad-account connect, launch-to-Meta (paused), daily results and ad-history sync |
| `STRIPE_*` (4 vars) | Checkout, customer portal, webhook-driven plans, trial enforcement |
| `NOTIFY_WEBHOOK_URL` / Resend | Founder lead alerts (demo requests + signups) |
| `RESEND_API_KEY` + `EMAIL_FROM` | The Monday report email and alert digests |
| `YOUTUBE_API_KEY` | YouTube Shorts signal adapter |
| `APIFY_TOKEN` | Per-term TikTok, rival ad reads and social reads (paid) |
| `APIFY_*_ACTOR` | Overrides when a default Apify actor is renamed |
| `X_BEARER_TOKEN` | X recent search (no keyless read access exists) |
| `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ID` | Reels per hashtag |
| `META_INSTAGRAM_SCOPES` | `1` only after Meta App Review approves `instagram_basic` |
| `GOOGLE_PLACES_API_KEY` | Local path: rival ratings, review mining, nearby-rival discovery |
| `CRON_SECRET` | The protected crons (ingest, intel, recommend, picks, weekly email, results sync) |

Ops surface: `GET /api/health` reports the mode of the database, generation and billing;
`/terms` and `/privacy` match actual behavior; account deletion cascades in both storage
modes; **819 unit tests across 81 files**, a signup-to-launch Playwright E2E, lint and
typecheck gate every change. Typecheck needs `npx next typegen` before `npx tsc --noEmit`
— Next 16 generates the global `PageProps`/`LayoutProps` types, and without it every route
file fails on a type it cannot find.

**The weekly rhythm for a DTC brand:** the Monday brief lands before the creative standup.
Open This week, read the top pick — the finding, the grade, the four signals under it — and
hand the three scripts to the team or the creator. Shoot mid-week, launch the five-day test
on the connected ad account — budgeted at 5% of the spend band's monthly floor — check the
kill rule on day three, and let the results sync back. Next Monday's call is sharper
because of what this one returned.
