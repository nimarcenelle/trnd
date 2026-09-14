-- The track record: every finished run carries a verdict, and the terms a
-- week held (rather than picked) are stored so the product can say what NOT
-- to run and why. Run after 0025. Idempotent: pasted by hand, safe to re-run.

-- ------------------------------------------------------------ run verdict
-- The owner's own call on how a run did, beside the numbers. The numbers
-- decide when they exist; the verdict decides when they don't.
alter table public.pick_runs
  add column if not exists verdict text check (verdict in ('won','lost'));

-- ------------------------------------------------------------- week skips
-- What the ranking held this week and why: a Hold grade, a term the brand
-- already ran and killed, a term the owner passed on, a term outside the
-- catalog. One row per (business, week, term); a re-rank replaces the week.
create table if not exists public.week_skips (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  week_of         date not null,
  term            text not null,
  normalized_term text not null,
  kind            text not null check (kind in ('hold','memory','fit')),
  reason          text not null,
  grade           text check (grade in ('A+','A','B+','B','C','Hold')),
  grade_score     numeric,
  created_at      timestamptz not null default now(),
  unique (business_id, week_of, normalized_term)
);
alter table public.week_skips enable row level security;
create index if not exists week_skips_business_week_idx
  on public.week_skips (business_id, week_of desc);
drop policy if exists "week_skips: via business" on public.week_skips;
create policy "week_skips: via business" on public.week_skips
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
