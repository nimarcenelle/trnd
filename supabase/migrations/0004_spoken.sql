-- The words said in a video, from TikTok's captions, so nothing we show as a quote is a guess. Safe to re-run; paste into the Supabase SQL editor before deploying.

-- Where TikTok keeps a video's captions. These links expire; each read brings a fresh one.
alter table public.videos add column if not exists subtitle_url text;
-- The words said, one caption per line. Empty when there are none to use, null when not read yet.
alter table public.videos add column if not exists spoken text;
