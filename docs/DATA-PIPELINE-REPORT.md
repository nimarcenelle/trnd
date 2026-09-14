# TRND data pipeline report

**What the model pulls, how it feeds the four signals, what it costs, how long it lasts.**

Date: 2026-09-14. Basis: the code on this branch (commit `4508a43`), the migrations, BLOCKED.md, GO-LIVE.md, and the live-verification notes in the repo dated 2026-09-11 and 2026-09-12. Every claim below points at a file. Two things could not be verified from this sandbox and are marked as such: which API keys are actually set in the Vercel project (the `/api/health` probe reports that, but this sandbox has no route to it), and any live response from any source (this container's egress policy blocks them).

---

## 1. The verdict

Your four breakouts are the model's four signals. They already exist as code, with the sub-weights you specified, and the ranking is decided by them (`lib/scoring/model.ts`, `lib/recommend/recommend.ts`).

| Your breakout | Signal in code | Weight in the grade | Sub-weights |
|---|---|---|---|
| 1. Customer: what is the customer base searching for, engaging with, paying for | `customer` | 35 | volume 40, intent 35, velocity 25 |
| 2. Competitors: who they are, what they advertise, what performed | `competitive` | 20 | whitespace 45, saturation trend 30, competitor weakness 25 |
| 3. Industry: what is trending, what can we jack | `culture` | 20 | category growth 40, seasonal fit 30, lifecycle 30 |
| 4. Own performance: what does well, what converts, what to reuse | `brand` | 25 | past-ad similarity 40, catalog fit 30, organic traction 30 |

A signal with low confidence is excluded from the grade and its weight is redistributed. That rule is honest, and it is also why the product reads thin: **in production today, with no paid keys, three of the four signals are excluded or near-empty for every brand, and the fourth (Customer) runs on one number.** The scoring model is sound. The data underneath it is not consistent, and the reasons are structural, not incidental. Section 5 lists them with file references.

The short version of what each breakout can and cannot say today:

| Breakout | Real today (keyless prod) | Real with the five keys in GO-LIVE | Not in the data at any price today |
|---|---|---|---|
| 1. Customer | Google Autocomplete phrasings; the target customer's vocabulary from the founding analysis; monthly search volume **only if** DataForSEO is keyed | Monthly search volume; YouTube Shorts views, velocity, engagement per term; TikTok per-term views, shares and saves (Apify); daily series for velocity | **What customers pay for.** There is no order, pixel, or transaction source. "Paying for" is inferred from buying-intent words in autocomplete and from share/save rates, never measured. |
| 2. Competitors | Nothing computable. Rival ad reads and social reads are Apify-gated, and the keyless Meta Ad Library scrape needs a browser that does not exist in Vercel functions | Direct rivals' active Meta ads (copy, CTA, days running, themes), Google ads, Instagram/TikTok/Facebook posts with engagement, Google ratings and reviews | **Rival spend, results, or conversions.** "What performed" is a proxy: an ad still running after 21 days is called proven; one pulled inside 7 days is called weak. |
| 3. Industry | TikTok Creative Center trending hashtags per industry (national, top 3 rows per query, about 40 a day); Google Trends national daily movers RSS; Google News counts; weather triggers for local brands | YouTube Shorts per category term; Gemini humanizes hashtags and marks them on/off topic | **Metro-level search interest.** The Google Trends interest-over-time read is dead from datacenter IPs and its browser fallback does not run in prod. Reddit is dead the same way. Rising related queries ride the same dead surface. |
| 4. Own performance | Catalog fit (deterministic token match, Gemini judge when keyed) and price-band fit. Nothing about past ads or posts | The brand's own Instagram/TikTok/Facebook posts (Apify); its ad history from an uploaded Ads Manager or Google Ads export, or a connected Meta ad account (180 days, ad level, with copy) | Nothing structural. This quadrant is fully buildable, but it is **owner-supplied**: without an export upload or a Meta connection it is empty, and the scorer ranks past ads on CTR against the account average, not on cost per result or ROAS. |

---

## 2. How the machine runs

Six Vercel crons (`vercel.json`), all UTC. Each is one serverless invocation with a 300-second ceiling.

| Cron | When | What it does | Budget | How it fails |
|---|---|---|---|---|
| `/api/cron/ingest` | daily 09:00 | The market read: 14 source adapters in a fixed priority order over every business's watch terms plus the stock category terms. Writes to `signals` and `signal_series`. Then scrubs YouTube rows older than 30 days | 240 s total, 60 s per adapter | **Sequential and shared.** When early adapters run long, later ones are skipped with a warning nobody reads. DataForSEO went 48 hours without a row this way (`lib/signals/ingest.ts:246`). |
| `/api/cron/intel` | daily 09:30 | Per business: own Google reviews (Places), each rival's ratings and reviews (Places), rival Meta and Google ads, own and rival social accounts, re-score rival directness, alerts | 270 s total, 200 s per business | Businesses the budget does not reach wait for tomorrow. Accounts refreshed inside 48 h are skipped, so each day gets further. |
| `/api/cron/recommend` | Monday 10:00 | Rank: build the candidate pool, fit gate, Gemini relevance judge, grade every candidate on the four signals, store the top 5 and the week's holds, write the reads and the #1 campaign | 300 s | One failed business is logged and skipped. If the judge is unavailable and a judged ranking exists, last week's list stands. |
| `/api/cron/picks` | Monday 10:20 | Write picks (finding, one metric, bet, kill rule, three scripts, evidence by signal) for every brand with a ranking; hands off to itself when the budget runs out | 300 s per hop | A pick without three scripts and one evidence row is stored as a draft. |
| `/api/cron/weekly-email` | Monday 10:30 | Report, analyst note, alerts, standing questions, Monday email | 300 s | Skipped silently when Resend is unkeyed. |
| `/api/cron/sync-results` | daily 11:00 | Pull Meta insights for launched campaigns, then every connected account's 180-day ad history | 300 s | No-ops when the Meta app is not configured. |

Note on hosting: six crons at these schedules require the Vercel Pro plan. The Hobby plan allows two cron jobs. If the project is on Hobby, four of the six never fire, and "nothing is evergreen if the crons don't run" (GO-LIVE item 8) is the live state.

---

## 3. Source inventory

Every pull the code makes, grouped by what it takes to work. "Feeds" names the signal(s) that read it. "Durability" is my rating of how long the read survives without engineering attention.

### 3a. Keyless, live, and expected to work from Vercel

| Source | What it pulls | Feeds | Caps | Cost | Durability |
|---|---|---|---|---|---|
| TikTok Creative Center board (`adapters/tiktok-cc.ts`) | Trending hashtags per industry: name, video views, rank, 7-day and 30-day popularity curve. Gemini humanizes the slug and marks on/off topic when keyed | Industry (growth), Customer (as a cultural read) | 7 industries × 2 boards × top 3 rows, about 40 hashtags a day, **national only**, no per-term read at any price (verified 2026-09-11) | $0 | Medium. Unofficial endpoint that answers JSON without auth today. Nothing contractual. |
| Google Autocomplete (`adapters/suggest.ts`) | Top 10 suggestions per watch term; count of buying modifiers; long-tail discoveries | Customer (intent texts) | 20 terms per run, **global**, not per business | $0 | High. Same endpoint the search box uses. |
| Google News RSS (`adapters/google-news.ts`) | Article count per watch term in the window | Competition proxy when no ad count exists; freshness | none | $0 | Medium-high. |
| Google Trends daily RSS (`adapters/google-trends-rss.ts`) | National trending terms with approximate traffic and a headline | Industry backdrop | national | $0 | Medium. Public feed, unofficial. |
| Open-Meteo (`adapters/weather.ts`) | 14 days past + 7 forecast per metro; deterministic triggers (first heat wave, freeze, patio window, rain streak) with a heuristic delta labeled as such | Industry timing for local brands only | one read per metro | $0 | High. |

### 3b. Official APIs, key-gated (set the key and the adapter runs)

| Source | What it pulls | Feeds | Caps | Cost | Durability |
|---|---|---|---|---|---|
| DataForSEO (`adapters/dataforseo.ts`) | Monthly Google Ads search volume per watch term with 12 months of history; month-over-month delta. **The backbone**: the Trends index anchors to it and the Customer volume reads from it | Customer (volume), the demand line | **100 keywords per run, global.** One POST, `location_code 2840` = United States. **The volume is national, not per metro**, even though the row is stamped with the business's metro geo | Pennies a day at this cap (repo cites ~$0.05 per 1k keywords; confirm on the first invoice) | High. Paid, documented, stable. |
| YouTube Data API (`adapters/youtube.ts`) | Per term over 28 days: Shorts views, uploads, velocity (views per hour), engagement, median duration, top and breakout video, repeat channels, corpus of titles | Customer (level, activity, series), Industry (growth, lifecycle), pick evidence | 10,000 units a day free; deep read costs ~200 units per own term, so roughly 40 to 45 business terms a day across all brands. Rows are scrubbed after 30 days per YouTube terms | $0 | High. Official. Quota is the ceiling, not money. |
| Google Places (New) (`reviews/places.ts`) | Own rating, review count, up to 5 reviews; the same for each rival; nearest same-category places for rival seeding | Competitors (ratings, reviews, seeding), review digest for copy | local brands only | ~$0 at SMB volume (free monthly allowance) | High. |
| Gemini (`ai/gemini.ts`) | Not a data source; the reader. Founding analysis (watchlist, target customer, vocabulary), relevance judge, hashtag humanizing, pick finding and scripts (Pro then Flash), reads, campaigns, review digest, standing questions, rival brand proposals | Everything that is written | model names resolved at runtime with fallbacks | Estimate $2 to $8 per brand per month; the repo says "cents per business per week" | High, with model-name churn handled in code. |
| Meta Marketing API (`ads/meta.ts`, `ads/history-sync.ts`, `ads/sync.ts`) | Connected account: 180 days of ad-level insights (impressions, link clicks, spend, purchases/leads by family, copy); campaign results for launched campaigns | Own performance (similarity, best theme), the learning loop | needs `ads_read` through App Review for the public; works now for app admins and testers | $0 | High once reviewed. Review is days to weeks. |
| Instagram Graph (`adapters/instagram.ts`) | Reels reactions per hashtag over 7 days | Customer, Industry | 30 hashtags per 7 days per business account; needs App Review for `instagram_basic`; scopes deliberately dark until then | $0 | Medium. Small quota, review-gated. Not worth chasing for client #1. |
| X recent search (`adapters/x.ts`) | Daily post counts over 7 days, engagement on a 25-post sample, top post | Customer (activity), demand line | 25 terms per run; free tier answers 402 (verified 2026-09-12); Basic is $200/month with a monthly read cap that 25 terms × 25 posts a day exhausts in about two weeks | $200/month | Medium. Pricing and caps have changed yearly. Skip. |

### 3c. Paid scrapers via Apify (one token, five actors)

All key-gated on `APIFY_TOKEN`. Cost is per result, not per call. Actors get renamed; every one has an env override.

| Read | Actor (default) | What it pulls | Feeds | Volume per brand |
|---|---|---|---|---|
| TikTok per term (`adapters/tiktok-apify.ts`) | `clockworks~tiktok-scraper` | 40 posts per term: views, likes, comments, shares, saves, duration, author followers, hashtags. Same shape as the Shorts read plus action rate and small-account flag | Customer (level, action %, activity), Industry, pick evidence | 25 terms per run **global**, 1,000 results a day shared across brands. **Network path has never run** (BLOCKED.md): field names unverified |
| Instagram / TikTok / Facebook accounts (`social/*.ts`) | `apify/instagram-profile-scraper`, `clockworks/tiktok-scraper`, `apify/facebook-posts-scraper` | 30 latest posts per account: caption, media type, likes, comments, shares, views, ad flag | Own performance (organic), Competitors (posts on term, cadence, moves), Customer (activity, persona blend) | Own 3 accounts + 5 rivals × 3 = up to 18 accounts, refreshed every 48 h, reused across workspaces for 7 days: ~270 results a day |
| Meta Ad Library by Page (`signals/adlibrary-apify.ts`) | `curious_coder/facebook-ads-library-scraper` | 30 active ads per rival: copy, headline, CTA, start date, days running; themes classified deterministically; "proven" (21+ days) and "new this week" | Competitors (whitespace, saturation, weakness), pick evidence, writer brief | 5 rivals × 30 = 150 results a day |
| Google Ads Transparency (`signals/google-ads-transparency.ts`) | `APIFY_GOOGLE_ADS_ACTOR` (no default; renderer otherwise) | Up to 30 ads per rival domain with first/last shown dates and format | Competitors | 150 results a day |

### 3d. Unofficial surfaces that are dead or unreliable from Vercel

| Source | State | Evidence |
|---|---|---|
| Google Trends interest-over-time (`adapters/trends-iot.ts`) | Direct widget API 403s from datacenter IPs; the Playwright fallback returns null in serverless | GO-LIVE item 1; `lib/import/render.ts` header |
| Google Trends rising related queries (`adapters/trends-related.ts`) | Same surface, same fate | same |
| Reddit public JSON (`adapters/reddit.ts`) | Returns the HTML page instead of JSON to datacenter IPs | BLOCKED.md, verified |

These three are the metro-level demand story in DATA-INVENTORY.md. In production they contribute nothing, and the inventory does not say so.

### 3e. Browser-only paths that cannot run in production

`lib/import/render.ts` launches Playwright. Playwright is a devDependency, excluded from the server bundle, and there is no Chromium in a Vercel function, so `getRenderer()` returns null and every caller silently returns nothing. Locally on a laptop all of these work, which is why the dev experience disagrees with prod.

- Meta Ad Library keyword saturation (`signals/adlibrary.ts`, the `meta_ads` adapter): the "Open door" count. In prod the count is always null and competition falls back to the news-coverage proxy.
- Competitor keyword ad reads in `intel/ingest.ts` when Apify is unset.
- Google Ads Transparency without an Apify actor.
- The Trends interest-over-time fallback.
- JS-only website imports at onboarding (the plain fetch and the Jina reader proxy still work).

### 3f. Owner-supplied, read once or on upload

| Input | How it arrives | Feeds |
|---|---|---|
| Website crawl (`import/website.ts`, `import/catalog.ts`) | One crawl at onboarding: nav, sitemap, menu PDFs and images, Shopify/WooCommerce catalog, JSON-LD, social links. Toast and Cloudflare-fronted ordering sites cannot be read | Catalog with prices (fit, price band), brand voice, photos, social handles |
| Founding analysis (`ai/brief.ts`) | Gemini writes it from the crawl: positioning, segments, watchlist of 18 to 30 search phrases, the target customer (who, triggers, vocabulary, hangouts, objections) | The watchlist drives every per-brand read; the vocabulary is the persona match |
| Ad export upload (`ads/import.ts`) | Meta Ads Manager or Google Ads CSV/XLSX, header-matched, 500 rows max, 5 MB | Own performance |
| Documents (`documents/*`) | Menus, decks, spreadsheets digested to 12 facts; bytes dropped | Reads, Ask, the Monday note (not the campaign prompts yet) |
| Recorded results (`results/record.ts`) | Manual entry per campaign, or the Meta sync | The learning loop, de-identified category learnings |
| Competitors | Auto-seeded (Places nearest five for local; Gemini proposals verified by site and ad library for online); editable in Settings | Competitors |

---

## 4. The four breakouts, one at a time

Everything in this section is `lib/scoring/gather.ts` (where the evidence comes from) and `lib/scoring/{customer,competitive,culture,brand}.ts` (what is done with it).

### 4.1 Customer: what is the customer base searching for, engaging with, paying for

**Volume (40).** The term's level: monthly search volume (DataForSEO), or a Trends interest index, or short-form views, whichever the signal row carries. Scored as a percentile against this brand's own trailing 90 days of readings in `signal_readings`, which needs at least 8 prior readings (`MIN_BASELINE`). Below that it falls back to an absolute curve (10 searches is 25, 100 is 50, 1,000 is 75, 10,000 is 100) capped at medium confidence. Then discounted by persona match: how close the term is to the target customer's own vocabulary and triggers from the founding analysis, blended with how the brand's real audience engaged with its own posts on the term once 5 or more own posts exist.

**Intent (35).** Two halves. Text: autocomplete suggestions on the term, Reddit titles, the top X post, short-form captions and titles, and the brand's and rivals' own captions on the term, classified by regex into purchase intent, pain point, complaint. Needs 3 items to score at all, 5 for high confidence. Action: shares plus saves per view on the term's short-form when a read has 2,000 or more views behind it (TikTok via Apify only; YouTube has no saves).

**Velocity (25).** Mean of the last 7 daily points against the last 30. Needs 14 daily points of the term's series.

**Where that leaves you in prod.** With DataForSEO keyed and nothing else: volume is a national monthly figure, intent is whatever autocomplete says (usually 3 to 10 phrasings), velocity is null because no daily series is being written (Trends is dead, YouTube and TikTok need keys). Customer reads "medium confidence" on one number plus a persona discount. With YouTube keyed, the series and the activity fill in for about 40 terms a day across all brands. With Apify, the action rate and the rival/own captions fill in.

**Readings accrue weekly, not daily.** A reading is written only when a term is graded, which happens on the Monday rank and on reranks. Eight readings means roughly eight weeks before "score relative, not absolute" switches on for any brand. Until then every percentile is the absolute curve.

**"Paying for" is not measured.** No source reports purchases. The nearest proxies are buying-modifier counts in autocomplete and the share/save rate. If you want breakout 1 to mean revenue, client #1's own conversion data (breakout 4) is the only place it can come from today.

### 4.2 Competitors: who they are, what they advertise, what performed, overlap with the recommendation

**Who they are.** Local: the five nearest same-category places from Google Places (key-gated), the business itself, closed listings and national chains dropped, then each rival's site is read for what it sells, its prices, and its social handles, and scored for directness (menu overlap, price band, distance). Online: Gemini proposes up to 12 brands; each is verified by loading its site, pulling handles from the site's own links, and checking the Meta Ad Library for live ads; marketplaces and dead domains are dropped; the five most direct are kept with a small edge for the ones advertising. Under-the-bar rivals are re-scored weekly. The owner can edit the list.

**What they advertise.** Each direct rival's active Meta ads by Page (Apify): copy, headline, CTA, start date, days running, deterministic theme (offer, scarcity, speed, social proof, novelty, education); and their Google ads with first/last shown dates. Plus their last 30 posts on each of Instagram, TikTok, Facebook with engagement, classified as promo, event, new item, proof, behind the scenes.

**What performed.** No spend or conversion data exists for a US commercial advertiser in either library. The scorer uses the only honest proxies: an ad still running after 21 days is proven (they kept paying for it); an ad that disappeared after fewer than 7 days is weak; a post under half the rival's own median engagement is weak; a rival's post that broke 2× their median inside 7 days is a move worth naming.

**Overlap with the recommendation.** Per candidate term: how many of the read rivals are on that angle now (posts or ads in the last 14 days) versus 15 to 45 days ago, and how many of their ads on it look weak. Whitespace is 1 minus the share of rivals on it. The writer is told what the rivals are already saying and instructed never to echo it (`ai/prompts/generate-campaign.ts`).

**Guardrail.** Zero rivals connected, or none whose posts or ads were actually read, returns no computed score, a note, and an "Add competitors" link. A rival counts as read only when something of theirs was seen. High confidence needs 3 rivals read, a prior window, and 12 evidence items.

**Where that leaves you in prod.** Without Apify, no rival ad or post is ever read, so Competitive is excluded from every grade. Places alone gives ratings and reviews, which the report shows but the scorer does not use. This quadrant is 100 percent dependent on one paid token.

### 4.3 Industry: what is trending, what insights can we jack

**Category growth (40).** The median 7-day delta across the category's short-form reads, Google Trends reads, and TikTok board reads, needing at least 3 reads; percentile against the category's trailing growth readings.

**Seasonal fit (30).** Preferably from a year of the term's own daily history (needs 30 points spanning 300 days over 8 months). That data does not exist and cannot exist for a year, so it falls back to the static per-vertical calendar in `recommend/seasonal.ts` (Valentine's, Mother's Day brunch, first cold snap, wedding season, and so on).

**Lifecycle (30).** Emerging, growing, peaking, declining, steady, read from the 90-day daily series, with a 60-day-vs-first-month check so a jump that is holding reads as growing.

**Where that leaves you in prod.** The TikTok board is the live industry read: about 40 national hashtags a day across seven industries, with a humanized term and an on/off-topic verdict when Gemini is keyed. It is national and says so in the UI. Growth needs 3 category reads with deltas; the board provides them. Lifecycle needs a daily series, which means YouTube or Apify. The seven stock categories are local-business verticals (restaurants, home services, health & beauty, fitness, retail, auto, dental). A DTC skincare or supplement brand maps to "Health & beauty" and borrows that board; there is no DTC-specific industry read.

**"What can we jack."** The pick evidence names the top and breakout video on the term (channel, duration, velocity), the hashtags the winners carry, the median winning length, and the repeat channels. That is concrete and copyable when the short-form read exists. Without a short-form key it is the hashtag name and a view count.

### 4.4 Own performance: what does well, what converts, what to reuse

**Past-ad similarity (40).** The brand's past ads matched to the term by shared words in copy, ad name or campaign name; their impression-weighted CTR against the account's CTR, only when the matched ads have 1,000 or more impressions in total (500 per ad to count). Percentile against every past ad's lift plus stored lifts. High confidence needs 10 or more ads in history.

**Catalog and economics fit (30).** The judged fit of the term to what the brand sells (deterministic token match, refined by the Gemini judge), minus 20 when the matched item sits outside the menu's price band (needs 2 or more priced items). Stock and margin are null: no inventory or cost feed exists. Fit below 0.4 holds the term regardless of the other three signals.

**Organic traction (30).** The brand's own posts on the term against its own median engagement, needing 5 or more posts read. An account that has been read and never posted on the term scores 30, a reading, not a gap.

**What to reuse.** `ads/history-read.ts` computes the account's best and worst ads, CTR by theme, the best theme (2 or more ads, 1,000 or more impressions), and the writer is told the best theme, the top three own posts, and the winning length.

**Where that leaves you in prod.** Without an export or a Meta connection, similarity is null. Without Apify, organic is null. Fit alone gives medium confidence, so Brand is in the grade, but it is fit only: "does this match the catalog," not "what has worked." Two things to know:

- **"Converts best" is not what the scorer ranks on.** Ad history rows carry spend and results (purchases, leads), but `similarLift` compares CTR to account CTR. A CTR-strong, conversion-weak ad reads as a winner. `results/compute.ts` computes ROAS and cost per result for the campaign loop, not for the brand signal.
- **The Meta connection works today for app admins and testers** without App Review. For a five-brand pilot that is enough. Beyond that, review.

---

## 5. Why it feels unreliable: the structural faults

These are the reasons the data connection is inconsistent. Each is a design property of the pipeline, reproducible without any source failing.

1. **One clock for everyone.** `runIngest` walks 14 adapters sequentially with one 240-second budget for every business at once (`lib/signals/ingest.ts:378`). An adapter that runs long starves everything after it. The fix so far was reordering. The next slow adapter reproduces it. The per-business first-day ingest already runs sources in parallel with `Promise.all` and per-source budgets (`runSignalIngestForBusiness`); the daily job does not.

2. **Caps are global, not per business.** DataForSEO reads the first 100 keywords (`adapters/dataforseo.ts`), Autocomplete 20 terms, Meta Ad Library 10, Trends related 12, TikTok per term 25, X 25, YouTube about 45 deep terms. Each business contributes up to 34 terms (24 watch terms plus 10 customer phrases) plus its 5 ranked terms. The `watch` list is built in business-list order, so from the fourth business on, the same brands are always the ones partially or never read, with no record that they were.

3. **Browser-only code paths ship to a runtime that cannot run them** (section 3e). They pass every local test and every laptop probe and produce nothing in prod. The inventory and the UI describe them as live.

4. **No ledger, no alarm.** An adapter's report (ok, skipped, error, rows written) is returned in the cron's JSON response and printed with `console.warn`. Nothing stores it and nothing reads it. `/api/health` reports key presence, not whether DataForSEO wrote a row today. The one outage documented in the code (48 hours without volume rows) was found by a person noticing.

5. **Metro volume is national.** DataForSEO is called with `location_code 2840` (United States) and the row is stamped with the business's metro or state geo. For a DTC brand that is correct. For a local business the "measured in your metro" claim is wrong, and the locality bonus in scoring (`LOCALITY_BONUS`) rewards the label.

6. **Relative scoring is eight weeks out.** Readings are written at rank time (weekly). `MIN_BASELINE` is 8. Every brand spends its first two months on absolute curves at medium confidence, and the "against your own recent weeks" language in the UI is not yet true for them.

7. **No daily series without a paid or quota-bound key.** Velocity (Customer) and lifecycle (Industry) both need daily points. In prod the only writers of daily points are YouTube (keyed, quota-capped) and the Apify reads. Trends, the abundant free series, is dead. DataForSEO's 12 monthly points are correctly filtered out of the daily series (`demand/series.ts`).

8. **The paid paths have never run live.** BLOCKED.md: the TikTok per-term actor's network path "has never run"; actor field names "drift"; confirm before trusting the first night's numbers. The unit suite (827 tests, all passing) is fixture-based. There is no contract test against any live source, and no canary.

9. **A bad read cannot be repaired the same day.** `signals` is unique on (source, term, geo, day). A partial or wrong read at 09:00 stands until tomorrow.

10. **Sample data leakage is closed, but keys are not enforced.** Production never ranks seeded signals (P-pass "professional means subtraction"), which is right. But nothing stops a deploy with the backbone key missing; the product degrades to templates and proxies quietly. A paying customer's week should refuse to run rather than run thin.

---

## 6. What it costs, long term

Volumes are derived from the code's own caps. Unit prices are the repo's figures where it states them and public list prices otherwise; treat the dollar figures as estimates to confirm on the first invoices.

### Fixed floor (independent of client count)

| Item | Monthly | Note |
|---|---|---|
| Vercel Pro | $20 | Required for six crons |
| Supabase Pro | $25 | The free tier pauses idle projects and caps at 500 MB; not acceptable for a paying client |
| Apify plan | ~$40 to $50 | Pay-per-result actors need a paid plan; usage is on top |
| DataForSEO | ~$2 to $5 | One request a day, at most 100 keywords |
| Resend, Places, YouTube, Stripe | $0 | Free tiers cover SMB volume; Stripe is a percentage |
| **Floor** | **~$90 to $100** | |

### Marginal per client per month

| Read | Volume per client | Estimate |
|---|---|---|
| Apify: rival Meta ads (5 × 30 daily) | ~4,500 results | Pay-per-result actors run about $0.30 to $5 per 1,000 depending on actor: **$2 to $25** |
| Apify: rival Google ads (5 × 30 daily) | ~4,500 results | **$2 to $25** |
| Apify: social accounts (18 × 30 every 48 h, reused across workspaces) | ~8,000 results | **$3 to $40** |
| Apify: TikTok per term | share of a 30,000-result global monthly pool | **$1 to $15** |
| Gemini (analysis, judge, 5 picks with scripts, reads, campaigns, digest, standing questions) | ~150 to 300 calls | **$2 to $8** |
| **Per client** | | **~$10 to $110**, realistically $30 to $60 |

At $500 a month per client that is an 80 to 95 percent gross margin on data. At 20 clients the data bill is roughly $700 to $1,300 a month. The number to watch is Apify, and the lever is already in code: the 48-hour refresh, the 7-day cross-workspace reuse, and reading only direct rivals.

### What not to buy

- **X Basic ($200/month).** The read pattern (25 terms × a 25-post sample daily) exceeds Basic's monthly read cap in about two weeks, and X adds language, not demand. Skip until a client asks.
- **Instagram Graph Reels.** 30 hashtags per week per business account, App Review, and a saturating count. The Apify account read already gives the brand's and rivals' Reels.

### Storage

Roughly 200 to 400 signal rows a day at five clients, with short-form rows carrying a corpus of up to 30 cards in `raw`. Call it 1 to 3 MB a day, under 1 GB a year. YouTube rows are scrubbed at 30 days by policy; nothing else has a retention rule. Supabase Pro includes 8 GB. Not a concern before 20 clients; a retention rule on `signals.raw` older than 120 days is a one-line migration when it is.

---

## 7. How durable each read is

| Class | Sources | Expectation |
|---|---|---|
| Official, paid or quota-bound API | DataForSEO, YouTube, Places, Gemini, Meta Marketing | Years. Breaks on announced deprecations. Code already handles Gemini model-name churn. |
| Paid scraper marketplace | Apify actors (5) | Months. Actors get renamed, re-priced, or change field names. Every actor has an env override, every mapper treats fields as optional, but a renamed field degrades to zeros silently, which is the failure you will not notice. Needs a weekly contract check. |
| Unofficial but public | TikTok Creative Center, Google Autocomplete, Google News RSS, Trends RSS, Open-Meteo | Autocomplete, News RSS and Open-Meteo: years. TikTok CC: could go behind a signed token any week (its per-hashtag detail endpoint already has). Trends RSS: medium. |
| Unofficial and already failing from datacenters | Trends interest-over-time, Trends related, Reddit anonymous | Dead now. Reddit has a documented fix (registered script app plus OAuth, GO-LIVE item 6). Trends has no fix on this surface; DataForSEO replaces it. |
| Browser-dependent | Meta Ad Library keyword scrape, Google Ads Transparency renderer, Trends renderer | Dead in prod by construction. Alive on a laptop, which is the trap. |
| Owner-supplied | crawl, exports, documents, results | As durable as the onboarding ritual. The export is a CSV format that changes about yearly; the importer matches by header alias, which is the right defense. |

What breaks first, in order: an Apify actor changes a field name (silent zeros); TikTok Creative Center adds auth (industry read goes dark); YouTube quota runs out on a day with more than ~45 own terms (later brands unread); the 240-second budget starves DataForSEO again on a slow day.

---

## 8. What consistent would take

In the order that changes what a client sees. Sizes are my estimate for one engineer.

1. **Per-business isolation in the daily ingest** (`lib/signals/ingest.ts`). Loop businesses, give each its own budget and its own caps, run its sources in parallel with `allSettled`, and record which terms were requested versus written. This ends the starvation and the silent partial coverage. About one day.

2. **A pipeline ledger and one alarm.** An `ingest_runs` table (day, business, source, terms requested, rows written, error, duration). `/api/health` reports the age of the last row per load-bearing source. A Slack message through the existing `NOTIFY_WEBHOOK_URL` when DataForSEO, YouTube, or any Apify read is older than 36 hours or wrote zero rows for a business. About one day. This is the single change that makes "is the data there today" a fact instead of a feeling.

3. **Remove or gate the browser paths.** Gate `getRenderer()` on `RENDERER_ENABLED=1`, report it in health, and let the inventory and the UI stop describing dead reads as live. Half a day.

4. **Set the keys, then verify from outside.** DataForSEO, YouTube, Gemini, Apify, Places (GO-LIVE items 1 to 4 plus 3). Confirm at `/api/health`. Run `scripts/probe-shortform.ts`, `probe-adlibrary.ts`, `probe-tiktok-cc.ts` from a machine with normal egress, and then weekly as a contract check. Add a `probe:all` script. Ops, plus half a day.

5. **Fix the geo on volume.** Pass a DataForSEO location code for the business's state or DMA on local brands; keep national for online brands. Half a day.

6. **Make relative scoring true from week two.** Capture readings daily from the ingest, or seed each term's 90-day baseline from its series on the first grade, so `MIN_BASELINE` is met in days. One day.

7. **Rank own performance on results, not CTR.** When spend and results exist on the matched ads, score cost per result or ROAS against the account; CTR only as the fallback. Half a day.

8. **Refuse to run thin for a paying brand.** If the backbone key is missing or the ledger shows zero rows for a brand's terms, hold the week with an internal alert rather than shipping a template. Half a day.

Items 1 to 4 are the difference between a pipeline that is sometimes there and one that is there and says when it is not. Items 5 to 8 are what makes each breakout say what its label claims.

---

## 9. What client #1 has to hand over

Breakouts 2 and 4 are owner-supplied at the edges. For the first client the onboarding is a conversation, not a form:

- **Ad history.** A Meta Ads Manager export (campaign, ad name, impressions, link clicks, amount spent, results, primary text) covering 6 to 12 months, or a Meta connection as an app tester. This turns on Own performance. Without it, breakout 4 is catalog fit only.
- **Handles.** Their Instagram, TikTok and Facebook handles, confirmed. The crawl finds them from site links most of the time; confirm anyway.
- **Rivals.** The five brands they actually lose customers to, named by them, in Settings. The auto-seed is a starting point. The Competitive signal grades against whoever is in that list.
- **Catalog with prices.** The crawl reads Shopify and WooCommerce; Toast and other Cloudflare-fronted ordering sites cannot be read, and prices then come from the owner or an upload.
- **The target customer.** Read the founding analysis's "who, triggers, vocabulary" back to them and correct it. The persona match discounts every Customer volume reading by it.

With those five inputs, the keys in section 8 item 4, and items 1 to 3 shipped, every one of the four breakouts has a real reading behind it for that one client, and the ledger shows it every morning.
