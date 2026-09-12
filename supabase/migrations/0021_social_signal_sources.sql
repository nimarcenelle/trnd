-- X and Instagram join the signal sources.
--
-- The demand score is a weighted composite across every place attention
-- actually shows up, and it was running on two live inputs. These are the
-- next two. Both adapters are key-gated and register unavailable without
-- credentials, so this constraint can land before either is switched on.
--
-- The check is the FULL union of every live source — replacing it with a
-- partial list breaks daily ingest.
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in (
    'google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok',
    'meta_ads', 'weather', 'dataforseo', 'snapshot', 'x', 'instagram', 'seed'
  ));
