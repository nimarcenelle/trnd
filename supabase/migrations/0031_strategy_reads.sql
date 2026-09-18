-- The week's account read: the strategist pass over the research dossier
-- (lib/research/strategist.ts), stored once per brand per week so every
-- brief that week starts from the same read and the page can show it.
-- Run after 0030. Idempotent: pasted by hand, safe to re-run.

-- read: the StrategyRead JSON (situation, insights, tensions, whitespace,
-- angles, unknowns, do_not). coverage: the dossier's coverage counts at the
-- time, so a week whose reads grew (rivals' ads landed after the first
-- grade) can be read again instead of served stale.
create table if not exists public.strategy_reads (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  week_of        date not null,
  read           jsonb not null,
  coverage       jsonb not null default '{}'::jsonb,
  dossier_chars  integer not null default 0,
  model_used     text not null default '',
  prompt_version text not null default '',
  created_at     timestamptz not null default now(),
  unique (business_id, week_of)
);
alter table public.strategy_reads enable row level security;
drop policy if exists "strategy_reads: via business" on public.strategy_reads;
create policy "strategy_reads: via business" on public.strategy_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
