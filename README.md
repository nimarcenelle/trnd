# TRND

Competitive intelligence that tells you what to do. TRND tracks what competitors sell, how they position it and what
they push to customers, across three public channels (their Meta ads, their websites, their marketing emails), then
reads it through your business (what you sell, to whom, your strengths, your goals) and recommends how to compete:
get ahead, win the choice, counter, or ignore, each with a campaign brief.

## How it works

1. **Setup** (`/app/setup`). The site is read (`lib/site.ts`). One model call names the brand and its 10 most influential rivals
   (`discoverRivals`, `lib/ai/analyze.ts`). The owner edits the list, then starts watching.
2. **Scan** (`lib/scan.ts`). For each rival:
   - The first scan finds the rival's Facebook Page (`lib/adlibrary/resolve.ts`): the Page their site links to; else an
     Ad Library search (name, domain, Page handle) for ads linking to their site; else the model looks at every
     advertiser found and picks one or none, and names other handles and names to try. A shared name alone never
     settles it. Pages matched before this are checked once against their ads and replaced if they are someone
     else's. The owner can paste the right Page on the rival's page. No Page found reads "not running Meta ads".
   - Every scan reads that Page's active ads (`lib/adlibrary/scrape.ts`) and diffs them against what is stored. New ads
     are **launched**. Ads missing from a complete read are **stopped**. Ads crossing 21 days live are **proven**
     (`lib/diff.ts`).
   - New ads are tagged with angle, hook and offer, and the model writes a report: insights with the ads that show them,
     three ads to make next, and a line on each rival's strategy.
   - The brand itself is a rival row with `is_self = true`, so its own ads go through the same scan; its profile
     (`brands.profile`: price, audience, promises, proof, offers, tone, differentiators) is editable on `/app/brand`.
   - Instagram and TikTok handles come from each company's site links (or the owner), are read through Apify
     (`lib/social/`), and get a daily follower snapshot for growth. Skipped without `APIFY_TOKEN`.
   - The owner sets goals (`brands.objectives`: goal, budget, target cost, focus) and can upload an Ads Manager CSV
     (`own_ad_results`, parsed by `lib/results.ts`), so advice is judged against what they want and what has worked.
   - Every ad is staged from age and versions (`adStage`, `lib/diff.ts`): testing, scaling, running or stopped.
   - Every ad gets a **conversion score**, 0-100 (`lib/score.ts`): a heuristic for how well it works for the company
     running it, blending longevity, engagement (likes, comments, shares on the organic Facebook, Instagram or TikTok
     post the ad also runs as, against the company's usual post), reach rank (its place when the Ad Library sorts the
     Page's ads by impressions), versions running and comment sentiment. Longevity and engagement lead; a missing
     signal drops out and the confidence says so. The report starts from this ranking: the topics and hooks of the
     top-scoring ads shape the opportunities and briefs.
   - **Websites** (`lib/sitewatch/`): each scan snapshots every competitor's homepage (headlines, description,
     announcement bar, offer lines, nav) and catalog (Shopify `products.json`, else JSON-LD), and records material
     changes against the last snapshot: products added or dropped, price moves, sales, promotions, new headlines.
   - **Emails** (`lib/inbox/`): every competitor gets an address, `<name>-<token>@INBOUND_DOMAIN`. The first scan signs
     it up to their newsletter (their Klaviyo form, or the signup form on their homepage); when it can't, the rival's
     Emails tab shows the address for the owner to sign up by hand. Mail arrives at `/api/inbound`, double opt-in links
     are followed, and the model tags each email's kind, offer, theme and whether it repeats an earlier send.
   - **The report** (the opportunity engine) connects signals across the three channels into patterns (new, ongoing,
     repeated), then writes 4-6 opportunities, each classified get ahead / win the choice / counter / ignore, with
     what was seen, the likely intent (hedged), why it fits or doesn't, urgency and confidence, a recommendation and a
     brief (angle, hook, offer, creative, format, audience, experiment), ranked by relevance, urgency, differentiation,
     feasibility and confidence. Evidence links to the ads, website changes and emails behind it. Plus where you stand.
   - `/app/timeline` is every competitor move across the three channels, day by day.
3. **Monitor**. Vercel Cron hits `/api/cron/scan` daily, which fans out one invocation per due brand. A scan that finds
   changes writes an update report and emails the owner.

## The scraper

`lib/adlibrary/scrape.ts` fetches the public Ad Library page (`facebook.com/ads/library/?view_all_page_id=…`, active
ads, every country, most impressions first) with a plain `fetch`. The first page of results is JSON embedded in the HTML.
Later pages come from the same GraphQL query the page itself calls. `lib/adlibrary/parse.ts` walks every JSON payload
for objects with an `ad_archive_id` and a `snapshot`, so it survives Meta moving things around.

If Meta answers with a login wall (it sometimes does to datacenter IPs), the same URL goes through an Apify Ad Library
actor when `APIFY_TOKEN` is set. Without the token, the rival shows the error.

Run the whole pipeline once for a real business, no database or login (needs `OPENAI_API_KEY`):

```
pnpm run:once glossier.com     # writes runs/glossier.com.md and .json
```

Or just the scraper:

```
pnpm probe "Brand Name"
pnpm probe --page 123456789
```

## Setup

```
pnpm install
cp .env.example .env.local   # fill in Supabase + OpenAI at minimum
pnpm dev
```

Paste `supabase/setup.sql` into the Supabase SQL editor and run it (it is `0100_surveillance.sql` then
`0101_brand_intel.sql`, `0102_page_source.sql`, `0103_signals.sql`, `0104_ad_scores.sql`, `0105_scan_state.sql` and `0106_candidates.sql`, safe to re-run). They create
`brands`, `rivals`, `ads`, `ad_changes`, `reports`, `social_profiles`, `social_snapshots`, `own_ad_results`,
`site_snapshots`, `site_changes` and `emails`, and leave the old
product's tables alone (drop them when convenient).

### Competitor emails

Set `INBOUND_DOMAIN` (e.g. `in.usetrnd.com`) and `INBOUND_SECRET`. With Resend: add the domain under Receiving (it
gives you the MX records), add a webhook for `email.received` pointing at `https://<site>/api/inbound`, and use its
signing secret (`whsec_…`) as `INBOUND_SECRET`; the body is fetched with `RESEND_API_KEY`. Any other inbound service
(a Cloudflare Email Worker, Postmark) can post `{from, to, subject, text, html}` as JSON to
`/api/inbound?secret=<INBOUND_SECRET>`. Without these, everything else runs and the Emails tabs say how to turn it on.

## Layout

```
app/                 landing, auth, /app (briefing, timeline, brand, setup, rivals/[id], settings), api/cron/scan, api/inbound, api/stripe/webhook
lib/adlibrary/       scrape (network), parse (pure), match (pure), facebook (Page id lookup), resolve (finding the Page)
lib/sitewatch/       snapshot + diff (pure), watch (network + storage)
lib/inbox/           parse (pure), verify (webhook signatures), subscribe (newsletter signup), store
lib/timeline.ts      one feed across ads, sites and emails
lib/ai/              openai (one structured-output call), analyze (rivals, tags, report)
lib/scan.ts          one brand's scan: scrape → diff → tag → report → email
lib/diff.ts          days running, the proven line
lib/score.ts         the conversion score, topics and hooks by score
lib/actions.ts       server actions
lib/data.ts          page reads (RLS)
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. The look and voice are in `BRAND.md`.
