-- A conversion score per ad: a heuristic for how well an ad has worked for the
-- company running it, from how long it has run, its reach rank, how many
-- versions it has, and (when the ad also runs as an organic post) that post's
-- engagement and comment sentiment. Safe to re-run.

-- Position in the Page's ads sorted by impressions on the last read (0 = most), and how many were read.
alter table public.ads add column if not exists impression_rank int;
alter table public.ads add column if not exists rank_total int;
-- What the ad is about, in a few words ("hard water", "hair breakage").
alter table public.ads add column if not exists topic text;
-- The organic post the ad matches, with its numbers: { platform, url, likes, comments, shares, views, sentiment, baseline }.
alter table public.ads add column if not exists engagement jsonb;
-- 0-100, and the parts it was blended from.
alter table public.ads add column if not exists score int;
alter table public.ads add column if not exists score_parts jsonb;
create index if not exists ads_score_idx on public.ads (brand_id, score desc);
