# TRND

Always-on surveillance for paid social. Enter your website; TRND profiles your brand, names your competitors, reads
every Meta ad you and they run plus everyone's Instagram and TikTok, tells you what's working and where you stand, and
watches for changes every day.

## How it works

1. **Setup** (`/app/setup`). The site is read (`lib/site.ts`). One model call names the brand and its 8 most likely rivals
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
   - The report follows four steps: competitor insights; where you stand (price tier, audience, message, strength,
     only you / only them / open lanes); should you copy it (each competitor move judged copy, adapt or skip, with why
     and how); and ads to make next (hook, format, creative, offer, audience, rationale).
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
`0101_brand_intel.sql` then `0102_page_source.sql`, safe to re-run). They create
`brands`, `rivals`, `ads`, `ad_changes`, `reports`, `social_profiles` and `social_snapshots`, and leave the old
product's tables alone (drop them when convenient).

## Layout

```
app/                 landing, auth, /app (dashboard, setup, rivals/[id], settings), api/cron/scan, api/stripe/webhook
lib/adlibrary/       scrape (network), parse (pure), match (pure), facebook (Page id lookup), resolve (finding the Page)
lib/ai/              openai (one structured-output call), analyze (rivals, tags, report)
lib/scan.ts          one brand's scan: scrape → diff → tag → report → email
lib/diff.ts          days running, the proven line
lib/actions.ts       server actions
lib/data.ts          page reads (RLS)
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. The look and voice are in `BRAND.md`.
