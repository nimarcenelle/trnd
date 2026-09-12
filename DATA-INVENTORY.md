# TRND Data Inventory — everything the signal engine pulls, categorized

Every source runs behind one adapter interface with a 10s timeout, retry, and a
circuit breaker (one dead source never fails the run). Everything lands in one
`signals` table — `source, term, category, geo, metric_type, value, delta_pct,
window_days, captured_at, raw` — deduped per source/term/geo/day, with 30-day
daily series in `signal_series`. Ingest runs daily (`pnpm job:ingest` / Vercel cron).

---

## 1 · Search demand (what people are Googling)

| Pull | Source | Fields captured | Geo granularity |
|---|---|---|---|
| National movers | Google Trends daily-trends RSS | trending term, approx traffic volume, related news headline/url | US national |
| Interest over time | Google Trends widget API | 30 daily interest points per watched term → weekly delta % | **Metro (DMA)** where the business's city maps to one, else state |
| Rising related queries | Google Trends related-searches API | breakout queries related to each watched term + growth % (capped +400%) | **Metro / state** |

The metro layer is the differentiator: business cities resolve to Nielsen DMA
codes (Atlanta → US-GA-524), so demand is measured where the customers are, not
nationally. Rising related queries are the discovery layer — terms nobody
configured, surfaced automatically.

## 2 · Search intent (how transactional the demand is)

| Pull | Source | Fields captured |
|---|---|---|
| Autocomplete reads | Google suggest endpoint (keyless) | top 10 suggestions per watched term; count of buying modifiers ("near me", "cost", "book", "same day"…); long-tail discoveries (new phrasings worth watching) |

## 3 · Social conversation

| Pull | Source | Fields captured |
|---|---|---|
| Subreddit heat | Reddit public JSON | weekly top posts per category subreddit (food, HVAC, SkincareAddiction, …): title, score, comment count, permalink |
| TikTok hashtags | TikTok Creative Center (unofficial) | trending hashtags per industry: name, video views, rank, humanized term, on-topic verdict |
| TikTok per term | Apify actor (needs `APIFY_TOKEN`) | per-term posts: views, likes, comments, shares, saves, duration, author followers, hashtags |
| X posts | X recent search (needs a PAID `X_BEARER_TOKEN`) | daily post counts over 7 days, engagement on a 25-post sample, top post |
| Instagram Reels | Graph API (needs `INSTAGRAM_ACCESS_TOKEN` + App Review) | reactions on Reels per hashtag over 7 days (the Reel count saturates at one page, so it is context only), permalink; 30 hashtags/7 days |

## 4 · News coverage

| Pull | Source | Fields captured |
|---|---|---|
| Coverage counts | Google News RSS per watched term | total + recent article counts (used as a saturation proxy when no ad data exists) |

## 5 · Competitor ads ← the competitor-tracking base layer

| Pull | Source | Fields captured |
|---|---|---|
| Ad saturation | Meta Ad Library | count of ACTIVE ads matching "<term> <city>" per ranked term, plus **advertiser names and ad copy snippets** (top ads kept in raw, rendered on the dashboard as "what competitors are running") |

This is already per-business (queries are built from each business's ranked
terms + city). It's the natural seed for a fuller competitor-tracking view:
the raw payload keeps who is advertising and what they're saying.

## 6 · Weather demand triggers (keyless, most local signal in the stack)

| Pull | Source | Fields captured |
|---|---|---|
| 21-day window | Open-Meteo forecast API per metro | 14 days past + 7 days forecast: daily max/min temp, precipitation → deterministic triggers: first heat wave, first freeze, patio window, rain streak, dry-window rebound — each with a plain-English detail sentence and a heuristic demand delta (labeled as such) |

Fires only when the forecast crosses a line the recent past didn't (a heat wave
in an Arizona July is not news and doesn't fire).

## 7 · Video (key-gated)

| Pull | Source | Fields captured |
|---|---|---|
| Shorts format | YouTube Data API (needs `YOUTUBE_API_KEY`) | per-term Shorts over 28d: views, likes, comments, duration, channel, velocity; median length, engagement rate, repeat channels, top + breakout video |

## 8 · Business-owned data (pulled once / entered by the customer)

| Pull | Source | Fields captured |
|---|---|---|
| Website import | One owner-initiated crawl at onboarding | business name, category, city/state, **menu/services with prices**, brand-voice hints, up to 6 real photos, page text (feeds the founding analysis) |
| Watchlist | Generated founding analysis | 5–8 search phrases this business's real customers use — these drive rows 1, 2, 4 above, per business, in its metro |
| Recorded results | Manual entry (Meta API sync is the roadmap item) | impressions, clicks, spend, bookings, revenue per campaign → CTR, cost/result, ROAS, and a lift score per persuasion angle |
| Learnings | Derived | category × geo × angle lift with sample sizes — the shared intelligence layer, always de-identified |

---

## Customer view vs master view (how the data is scoped today)

- **Master pool:** all of categories 1–7 land in one shared `signals` table —
  market data, owned by no customer. This IS the master view; an internal
  screen over it is a query, not a schema change.
- **Customer view:** each business sees the pool filtered to its category +
  its state/metro, re-scored against *its* services, fit-gated, and graded —
  that's the weekly dashboard.
- **Per-business rows:** watchlist terms, ad-library reads (term + city),
  weather (metro), website import, results. Results roll up into de-identified
  category learnings that sharpen everyone.

Provenance is kept everywhere: every signal knows its source, its geo level
("Atlanta metro" vs national), and whether a delta is measured or heuristic —
and the UI shows it.
