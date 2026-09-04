-- Evergreen demand terms from the founding analysis join the signal sources
-- ('snapshot'), and DataForSEO search volumes get their source ('dataforseo'):
-- when the trend pool doesn't fit a business, its own watch terms become the
-- week's candidates instead of least-bad junk. The check is the FULL union of
-- every live source — replacing it with a partial list breaks daily ingest.
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'weather', 'dataforseo', 'snapshot', 'seed'));

-- The relevance judge's 0-1 fit, persisted so screens can re-derive the same
-- gated score breakdown the ranking used (null = ranking was never judged).
alter table public.opportunities add column relevance numeric(3,2);
