# TikTok data: what TRND for creators can get, and from where

Researched October 2026. TikTok's developer sites were not reachable from the research environment, so field names
below come from search snippets of official pages and from third-party connector docs. Anything marked **unverified**
needs checking in TikTok's developer portal before we build on it.

## What each number needs

| Data | Source | Creator login? | Confidence |
| --- | --- | --- | --- |
| Views, likes, comments, shares per video | Public read (Apify `playCount`, `diggCount`, `commentCount`, `shareCount`) or Display API `video.list` (`view_count`, `like_count`, `comment_count`, `share_count`) | No / yes | High |
| Saves per video | Public read (`collectCount`). Not in the Display API video object | No | Medium |
| Followers, likes, video count | Public read (`authorMeta.fans`, `heart`, `video`) or Display API `user.info.stats` | No / yes | High |
| Follower growth over time | Our own daily snapshots, from the first read (no history to backfill) | No | High |
| Average watch time, full-watch rate | Business / Organic API (`average_time_watched`, `full_video_watched_rate`) | Yes, Business account (Creator accounts unclear) | Medium, field names **unverified** |
| Retention curve (where people swipe) | Business / Organic API, per-second retention | Yes | Low, field name **unverified** |
| Followers gained per video | Business / Organic API (`new_followers`) | Yes | Medium, **unverified** |
| Traffic sources, audience countries, ages, active hours | Business / Organic API | Yes | Medium to low, **unverified** |
| Trending hashtags by industry | TikTok Creative Center (public site, no official API; Apify actors exist; logged-out views may show only the top few) | No | Medium |
| Trending sounds and creators | Creative Center feeds reportedly removed in June 2026 (**unverified**). We count sounds and hashtags ourselves from niche videos | No | Our own counts: high |
| Peer creators and their videos | Public read of hashtag and profile pages | No | Medium to high |
| Research API | Non-profit academic researchers only, no commercial use | n/a | High: not an option |
| Instagram Reels reach, saves, follows, avg watch time | Instagram Graph API media insights (`reach`, `saved`, `follows`, `views`, `ig_reels_avg_watch_time`) | Yes, Business or Creator account, Meta App Review | Medium to high |

## What this branch does

- **Everything on the page comes from public reads.** Apify's `clockworks~tiktok-scraper` (`lib/tiktok/read.ts`) reads
  the creator's last 30 videos, each peer's last 15, and recent videos under the niche hashtags, every day. Saves come
  from `collectCount`. Mappers tolerate renamed fields, which degrade to "—".
- **History is ours.** `video_snapshots`, `follower_snapshots` and `trend_snapshots` are written every read, so growth
  and "48 hours later" work from day one forward.
- **Trends** are counted from the niche videos we read: this week against last, by hashtag and by borrowed sound
  (original sounds are someone's voice, not a trend). They describe the niche sample, not all of TikTok, and the page
  says so. A Creative Center actor can be plugged in with `APIFY_TIKTOK_TRENDS_ACTOR`. Actor schemas vary, so the mapper
  tries several field names; it is untested against a live actor.
- **Connect TikTok** (Login Kit, `lib/tiktok/connect.ts`) is built: OAuth with a state cookie, tokens stored for the
  service role only, refresh, revoke on disconnect, and a refused connection when the account isn't the one tracked.
  It reads `user.info.stats` and `video.list` and overlays those counts on the public read. It adds verified numbers
  and proof of ownership, **not** watch time. It needs a TikTok developer app and TikTok's review before anyone outside
  the sandbox's test users can use it.
- **Not built: Business / Organic API insights** (watch time, retention, followers per video, audience). Field names
  and account eligibility are unverified, and it needs a separate developer app and review. The UI says plainly that
  these numbers are private and come with connecting.

## Caveats

- **Terms.** TikTok's terms restrict automated collection. Reading public pages through Apify is a terms and anti-bot
  risk, and fields can break without notice. The long-term path is connected accounts for the creator's own numbers,
  with public reads only for peers and trends.
- **Account types.** Personal accounts can use Login Kit, but only for public counts. Deep analytics realistically
  need a Business account. Sell those features as "connect your Business account"; never promise retention to
  personal accounts.
- **Review timelines** for the Display API, the Business API and Meta's App Review are unverified. Budget several weeks
  for each and start them early.
- **Data handling.** Delete tokens on disconnect (done) and the account's data on request. Refresh rather than keep
  stale data forever.

## Sources

- Display API overview: https://developers.tiktok.com/doc/display-api-overview/
- Video object: https://developers.tiktok.com/doc/tiktok-api-v2-video-object
- `user.info.stats` scope migration: https://developers.tiktok.com/bulletin/user-info-scope-migration
- Rate limits (600 req/min per endpoint): https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit
- Business API portal: https://business-api.tiktok.com/portal/docs
- Organic field lists (third party): https://docs.supermetrics.com/docs/tiktok-organic-fields, https://help.sarasanalytics.com/en_US/tiktok-business/schema-information, https://www.catchr.io/metrics/tiktok-metrics
- Research API codebook: https://developers.tiktok.com/docs/en/research-api-codebook
- Creative Center: https://ads.tiktok.com/help/article/creative-center
- Instagram media insights: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
