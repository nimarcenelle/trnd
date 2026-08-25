-- TikTok Creative Center joins the signal sources.
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'reddit', 'youtube', 'news', 'tiktok', 'seed'));
