-- Detect v2: two new local-first signal sources.
-- 'weather'         — Open-Meteo forecast-derived demand triggers per metro
--                     (metric_type 'weather_trigger', heuristic deltas
--                     flagged in raw).
-- 'google_suggest'  — autocomplete intent + discovery reads
--                     (metric_type 'search_intent').
alter table public.signals drop constraint signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'weather', 'seed'));
