-- The ad history gets the numbers a DTC brand buys on and the ones a hook
-- is judged by: purchases and their value apart from the platform's
-- generic "results", 3-second plays and ThruPlays, the creative's own image,
-- and the platform's ad id so a synced ad can be linked to a creative test
-- by id instead of by name. Run after 0031. Idempotent: pasted by hand,
-- safe to re-run.

alter table public.ad_history
  add column if not exists external_ad_id text,
  add column if not exists purchases integer,
  add column if not exists purchase_value_cents integer,
  add column if not exists video_3s_views integer,
  add column if not exists thruplays integer,
  add column if not exists creative_url text,
  add column if not exists creative_kind text,
  add column if not exists run_id uuid references public.pick_runs (id) on delete set null;
alter table public.ad_history drop constraint if exists ad_history_creative_kind_check;
alter table public.ad_history
  add constraint ad_history_creative_kind_check check (creative_kind is null or creative_kind in ('video','image','carousel'));
create index if not exists ad_history_external_idx on public.ad_history (business_id, external_ad_id);
create index if not exists ad_history_run_idx on public.ad_history (run_id);
