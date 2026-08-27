-- Evergreen demand terms from the founding analysis join the signal sources:
-- when the trend pool doesn't fit a business, its own watch terms become the
-- week's candidates instead of least-bad junk.
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'snapshot', 'seed'));

-- The relevance judge's 0-1 fit, persisted so screens can re-derive the same
-- gated score breakdown the ranking used (null = ranking was never judged).
alter table public.opportunities add column relevance numeric(3,2);
