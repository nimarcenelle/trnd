-- Meta Ad Library joins the signal sources: real competitor ad-saturation
-- reads (metric_type 'ad_saturation') replacing the news-coverage proxy.
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'seed'));
