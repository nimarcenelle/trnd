# TRND

Always-on surveillance for paid social. Enter your website; TRND names your competitors, reads every Meta ad they run,
tells you what's working, and watches for changes every day.

## How it works

1. **Setup** (`/app/setup`). The site is read (`lib/site.ts`). One model call names the brand and its 8 most likely rivals
   (`discoverRivals`, `lib/ai/analyze.ts`). The owner edits the list, then starts watching.
2. **Scan** (`lib/scan.ts`). For each rival:
   - The first scan searches the Ad Library for the rival's name and picks its Facebook Page by website domain or exact
     name (`lib/adlibrary/match.ts`).
   - Every scan reads that Page's active ads (`lib/adlibrary/scrape.ts`) and diffs them against what is stored. New ads
     are **launched**. Ads missing from a complete read are **stopped**. Ads crossing 21 days live are **proven**
     (`lib/diff.ts`).
   - New ads are tagged with angle, hook and offer, and the model writes a report: insights with the ads that show them,
     three ads to make next, and a line on each rival's strategy.
3. **Monitor**. Vercel Cron hits `/api/cron/scan` daily, which fans out one invocation per due brand. A scan that finds
   changes writes an update report and emails the owner.

## The scraper

`lib/adlibrary/scrape.ts` fetches the public Ad Library page (`facebook.com/ads/library/?view_all_page_id=…`, active
ads, every country, most impressions first) with a plain `fetch`. The first page of results is JSON embedded in the HTML.
Later pages come from the same GraphQL query the page itself calls. `lib/adlibrary/parse.ts` walks every JSON payload
for objects with an `ad_archive_id` and a `snapshot`, so it survives Meta moving things around.

If Meta answers with a login wall (it sometimes does to datacenter IPs), the same URL goes through an Apify Ad Library
actor when `APIFY_TOKEN` is set. Without the token, the rival shows the error.

Try it from any machine:

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

Run `supabase/migrations/0100_surveillance.sql` in the Supabase SQL editor once. It creates `brands`, `rivals`, `ads`,
`ad_changes` and `reports`, and leaves the old product's tables alone (drop them when convenient).

## Layout

```
app/                 landing, auth, /app (dashboard, setup, rivals/[id], settings), api/cron/scan, api/stripe/webhook
lib/adlibrary/       scrape (network), parse (pure), match (pure)
lib/ai/              openai (one structured-output call), analyze (rivals, tags, report)
lib/scan.ts          one brand's scan: scrape → diff → tag → report → email
lib/diff.ts          days running, the proven line
lib/actions.ts       server actions
lib/data.ts          page reads (RLS)
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
