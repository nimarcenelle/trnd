-- The record learns from every ad, not only TRND's tests: each ad-history
-- row is classified once by angle, kind of opening and format, so the Track
-- record can say how each angle does for this brand across its whole
-- account. A finished test also keeps how closely the ad followed the
-- brief, so a wrong concept and a wrong shoot are counted apart. Run after
-- 0032. Idempotent: pasted by hand, safe to re-run.

alter table public.ad_history
  add column if not exists angle text,
  add column if not exists hook_type text,
  add column if not exists format text,
  add column if not exists classifier text;
alter table public.ad_history drop constraint if exists ad_history_angle_check;
alter table public.ad_history
  add constraint ad_history_angle_check check (angle is null or angle in ('education','offer','scarcity','social_proof','speed','novelty'));
alter table public.ad_history drop constraint if exists ad_history_hook_type_check;
alter table public.ad_history
  add constraint ad_history_hook_type_check check (hook_type is null or hook_type in ('question','problem','claim','story','comparison','callout','demonstration','offer','other'));
alter table public.ad_history drop constraint if exists ad_history_format_check;
alter table public.ad_history
  add constraint ad_history_format_check check (format is null or format in ('talking_head','ugc','demo','static','editor','studio','carousel','video','unknown'));

-- fidelity_score: the share of the brief's checks the finished ad passed,
-- 0 to 1. fidelity_read: the checks themselves and where the words came from.
alter table public.pick_runs
  add column if not exists fidelity_score numeric,
  add column if not exists fidelity_read jsonb;
