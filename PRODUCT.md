# TRND — What the product does

**One line:** TRND tells a small business what to advertise this week, why now, and hands
them the finished campaign — then learns from what actually converted.

Everything hangs off five steps: **Detect → Match → Position → Launch → Learn.** The app
reads demand signal in a business's category and metro, matches it against what that
business actually sells, builds the campaign, helps launch it, and learns from recorded
results. Every screen is one of those steps. It is decision replacement, not decision
support — not a dashboard of mentions.

---

## The customer's journey

### 1. Landing page (`/`)
Marketing site in the brand system: hero, "old way vs TRND way" split, the five-step
interactive explainer, signal proof cards, flywheel diagram, roadmap, pricing band
(**$149/mo TRND · case-by-case; annual two months free**), and a demo-request form.
Footer links Terms and Privacy. Two funnels: **Start free** → signup, and the demo form —
which writes to the database *and* alerts the founder on Slack/email the moment a lead
lands (as does every new signup).

### 2. Signup & auth (`/signup`, `/login`, `/forgot`)
Password auth, plus magic links when Supabase is configured. Forgot-password sends a
recovery email that lands on `/auth/reset`. Signup carries a Terms/Privacy consent line.
Without Supabase keys, demo-mode auth (scrypt-hashed passwords, HMAC-signed session
cookie) provides the identical flow.

### 3. Onboarding (`/onboarding`)
The wizard leads with the business's website: it crawls the homepage, the pages its nav
links, and the pages its sitemap lists that the nav never mentions (a multi-location
café's per-location and menu pages), reads the priced menu PDFs and menu images it finds
there, and pulls the online catalog from Shopify/WooCommerce alongside — then extracts
name, category, location, priced offerings, brand voice, and photos (JSON-LD, price-line
heuristics, headless render for JS-only sites, Gemini refinement when keyed) and collapses
everything into one confirm screen, menu items first. No website, or a blocked
crawl → five short manual steps: name, category, location + radius + price band,
services with prices, voice notes. Finishing:
- starts the **14-day trial clock**,
- redirects instantly to the dashboard,
- generates the founding analysis in the background,
- fires a founder signup alert.

### 4. The founding analysis (`/app/snapshot`)
Minutes after joining, the business gets its full read: positioning, customer segments,
market context, pricing read, seasonality, strengths, moat, watchouts, concrete first
moves — and a **watchlist of 5–8 search phrases its real customers use**, which then
drives its personalized signal ingestion. Model-written when Gemini is keyed; a
category-informed deterministic version otherwise (auto-upgrades when a key lands).
When the analysis lands, the week's ranking automatically rebuilds against it.

### 5. The dashboard (`/app`) — the product
**The week's ad, written before the owner opens the app.** Once the ranking lands, the #1
pick's campaign is built without being asked — by the Monday cron, and self-healed by the
dashboard whenever the top pick has no campaign yet (a passed pick, a fresh re-rank). The
hero *is* the ad: the hook as the headline, the angle in one paragraph, then Offer, Who
sees it, Spend, Launch by — and how it reads in-feed, on the right. Two verbs: **Open the
campaign →** and **Not this one** (the next pick becomes #1 and its ad is written). Thin
weeks and locked plans are never built unasked; those stay the owner's call.

**Why this pick** sits one click down and holds everything the hero used to lead with:

- **The read** (Gemini keyed): two or three model-written paragraphs — the verdict first
  (run it, run it small, skip it) and the one fact that decides it, then why the numbers
  land where they do for *this* business. Written from the same facts the meters show,
  cached per pick, rewritten only when those facts move.
- Four insight lines with expandable detail, the letter grade (A–C, fixed honest bands)
  on a ring, and four scored meters:

| Meter | Reads |
|---|---|
| **Momentum** | How fast the term is rising (metro-measured where possible) |
| **Fit** | Does it match what this business actually sells |
| **Open door** | Competitor ad saturation — real Meta Ad Library counts when captured |
| **Track record** | Measured learnings; seeded priors labeled illustrative |

- "How to run it well" creative guidance, the matched service, the competition read,
  coverage, the 6-day forecast, and what competitors are running on the term.

**Ask about this pick** closes the hero. It opens with the questions this owner would
ask about this pick — model-written with the read ("Why this over the brow lamination?",
"Is $25 a day enough?") or deterministic until then — and answers from the pick's own
facts plus everything Ask-TRND holds. When a question asks to run the pick differently
("do this for my other service instead", "aim at parents", "lead with the Tuesday
special"), the answer ends in a one-line direction and a button that **rewrites the
campaign that way** in place, as long as it hasn't launched.

**Questions TRND keeps answering** sits right under the hero: the owner's standing
questions ("Who is advertising against me this week?", "Is my facial priced right for
Atlanta?"), re-answered every Monday against that week's facts and memory, each with one
line on what moved since the last answer. Suggested openers name their own services and
city; a new question is answered on the spot. Up to five. They ride in the Monday email.

**Memory.** Every pick's facts, the Ask context, and the Monday note carry what TRND
remembers about this business over the last six weeks — weeks a term was ranked, passes,
the ad written on it and what it returned, rival ad counts moving — so week six reads
differently from week one by construction (`lib/recommend/history.ts`).

Below the hero: the demand chart, the next-in-line list, the competitors panel (read daily,
on every plan), and **Coming up** (known demand moments, "start now, 6 weeks lead"). The free
organic post lives inside Why this pick. A refresh button rebuilds the week on demand. Once
results exist, a KPI row shows launched campaigns, average CTR, and the spend ledger.

**Navigation is three tabs** — This week, Campaigns, Settings. The weekly report is linked
from This week, the analysis from Settings, the full ranking from the hero; Ask lives on the
pick itself.

### 6. Opportunities (`/app/opportunities`)
The week's full ranked list — one line each with grade, insight chips, and an expandable
"why this score." Accept (build) or dismiss each.

### 7. The campaign (`/app/campaigns/[id]`)
One click on **Build the campaign** streams generation progress and produces the full
package as a four-step launch guide:

1. **Shoot** — three static creative briefs (using the business's own site photos when
   harvested) plus three 20–30s video scripts.
2. **Write** — five headlines, three primary texts with an in-feed ad preview, landing
   copy, and live links to what's working on TikTok/Instagram for the term.
3. **Target** — audience, age range, radius, budget sized to the price band, a 6-day A/B
   flight plan with a kill rule (pause anything under half median CTR at 1,000
   impressions).
4. **Launch** — checklist, copy-all, JSON download, **CSV formatted for Meta Ads
   Manager**, and "mark as launched."

All copy is brand-voiced, priced from the real menu, and category-correct — a restaurant
gets "$24, this week only," never "consult, applied to your first visit." Gemini-generated
with schema validation when keyed — three routes into the demand (the thing, the moment,
the person), a judge, the assets, then a copy chief's pass that rewrites any line a
person wouldn't say out loud — and a deterministic brand-voiced generator otherwise. A
build steered from the pick's Ask box carries the owner's direction into every call —
it decides which service, offer, audience, or angle leads, and can never add a promise
the menu doesn't list. Rewrites keep the campaign's id, so links and results still
point at it; a launched campaign is never rewritten.

### 8. Results — on the campaign, and the flywheel (`/app/results`)
Once a campaign is marked launched, **Record what happened** appears on the campaign
itself: a manual entry row (impressions, clicks, spend, bookings, revenue — schema ready
for the Meta API sync) and that campaign's history. `/app/results` (linked from Campaigns)
rolls everything up: CTR vs an illustrative category benchmark, cost per result, ROAS, a
one-line takeaway ("CTR runs 56% above typical — scale the winner"), a CTR-by-campaign
chart, the full history, and the **learnings panel**: every recorded result updates
category-level lift by persuasion angle, which feeds the track-record component of next
week's scores. Seeded priors are dashed and labeled, and the first real result *replaces*
them — truth is never blended with sample data.

### 9. Settings (`/app/settings`)
Business profile and radius; services (add / price / activate / deactivate / remove);
**Your documents** — upload a menu (PDF or Word), a sales or POS export (Excel or CSV), brand
notes, past ad results, or paste text. TRND reads it once (the model reads PDFs; Word, Excel,
CSV and text are read on their own — top sellers, totals, priced lines), keeps the facts
and never the file, and cites them in every pick's read, every Ask answer, and the Monday
note. A menu that lists priced items offers one click to add them to the services list —
the contract every campaign is written against. Up to ten documents, 8 MB each;
**Plan & Billing** — trial countdown, Stripe checkout for the one plan, customer portal, or
a plain explanation of which env keys switch billing on; **Account** — change password,
typed-DELETE account deletion with full data cascade; and the integrations panel showing
what's live vs dormant.

---

## Behind the scenes

### Detect — daily cron + `pnpm job:ingest`
Ten adapters behind one interface, each with a 10s timeout, exponential-backoff retry,
and a circuit breaker — the job succeeds on partial results, and one dead source is a
logged warning, never a failed run.

- **Google Trends RSS** — national movers, keyword-classified into categories
- **Google Trends interest-over-time** — measured **per metro**: business cities resolve
  to Nielsen DMA codes (top ~50 US metros, suburb aliases, state-verified)
- **Google Trends rising related queries** — per business watch term, per metro: the
  discovery layer that surfaces breakout phrasings nobody typed into a config
- **Weather triggers** — Open-Meteo forecasts (keyless) per place; deterministic rules
  that fire only when the forecast crosses a line the recent past didn't: first heat wave
  → AC tune-ups, first freeze → heating checks and tire swaps, patio windows, rain
  streaks, wash-and-detail rebounds. Deltas labeled heuristic, framed as forecast-derived
- **Google Autocomplete** — keyless buying-intent reads per watch term ("near me,"
  "cost," "book") plus long-tail discoveries
- **Reddit** — category subreddits, weekly top conversation
- **Google News RSS** — corroboration / coverage counts
- **TikTok Creative Center** — trending hashtags by industry (unofficial, national)
- **Apify TikTok actor** — per-term TikTok reads, key-gated and paid
- **Meta Ad Library** — real competitor ad-saturation counts per ranked term
- **YouTube Data API** — key-gated

Every business's snapshot watchlist personalizes what gets watched, in its own metro.

### Match & score — weekly cron + on-demand
The transparent formula lives in one file (`lib/scoring.ts`):

```
score = 0.35 × momentum + 0.25 × fit + 0.20 × competitor gap + 0.20 × track record
        (+ locality bonus: metro-measured +0.5, state +0.2 on the 10-scale)
```

Then the **relevance gate**: a concept judge — deterministic always, Gemini-refined when
keyed — re-judges fit against what the business actually sells and scales the total by
it. A mismatched trend can never ride momentum to #1; a BBQ smokehouse never sees an
espresso-martini trend, while the restaurant that actually has a bar legitimately does.
Every score renders its reasoning in plain English; low-fit picks say "Outside your lane"
rather than dressing up as opportunities.

### Learn
`lib/results/compute.ts` maps recorded results to a 0–1 lift per persuasion angle
(education, offer, scarcity, social proof, speed, novelty), blended by sample size into
category × geo learnings with provenance — the moat's data layer, shaped so the Meta
Marketing API sync drops in without a schema change.

---

## Pricing & plans

One plan. Two tiers before the first paying customer was a decision tax on the buyer.

| Plan | Price | What it is |
|---|---|---|
| Free trial | 14 days | Full product, no card required |
| **TRND** | **$149/mo** | One ad a week written for you, why this one, rivals read daily, the Monday email, results tracking |
| Case by case | Let's talk | Hands-on lighthouse tier |

Founding businesses lock their price for life. The campaigns generated are the
customer's — export works on every plan, trial included. An expired trial (with billing
live) gates *new* campaign builds only (the auto-build included); nothing already
generated is ever held hostage, and nothing locks at all until Stripe keys exist. The
`pro` plan id survives in code for any subscription that already carries it; it is not
sold.

## Modes & infrastructure

With **zero env keys** the whole product runs in a loudly-labeled demo mode: local seeded
store, local auth, template generation, dormant billing. Each key switches its subsystem
on independently — no code changes:

| Key(s) | Switches on |
|---|---|
| Supabase URL + keys | Postgres with per-business RLS + Supabase Auth |
| `GEMINI_API_KEY` | Model-written briefs, judged rankings, generated campaigns |
| `STRIPE_*` (4 vars) | Checkout, customer portal, webhook-driven plans, trial enforcement |
| `NOTIFY_WEBHOOK_URL` / Resend | Founder lead alerts (demo requests + signups) |
| `YOUTUBE_API_KEY` | YouTube Shorts signal adapter |
| `APIFY_TOKEN` | Per-term TikTok adapter (paid; falls back to the national board) |
| `APIFY_TIKTOK_ACTOR` | Override when the default Apify actor is renamed |
| `META_INSTAGRAM_SCOPES` | `1` only after Meta App Review approves `instagram_basic` |
| `CRON_SECRET` | Protected daily ingest + weekly recommend crons (Vercel) |

Ops surface: `GET /api/health` reports each subsystem's mode; `/terms` and `/privacy`
match actual behavior; account deletion cascades in both storage modes; 109 unit tests +
a signup-to-launch Playwright E2E + lint + typecheck gate every change.

**The weekly rhythm for an owner:** open the dashboard Monday, read one graded
recommendation and why, click build, launch on their own ad account by midweek at
$25–50/day, type in results after the flight — and next Monday is sharper because of it.
