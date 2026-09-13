-- The four-signal scoring model: each signal scores 0-100 against a rolling
-- baseline with a confidence, and the four combine into an Opportunity Grade.
-- Run after 0023. Idempotent: pasted by hand, safe to re-run.

-- ------------------------------------------------------ opportunity grades
alter table public.opportunities
  add column if not exists grade text,
  add column if not exists grade_score numeric,
  add column if not exists signal_scores jsonb not null default '{}'::jsonb;

-- -------------------------------------------------------- signal readings
-- One raw reading per brand, day, signal and term. "Where does this week
-- fall against the trailing 90 days for this brand" needs the 90 days kept.
create table if not exists public.signal_readings (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  captured_on  date not null default current_date,
  signal       text not null check (signal in ('customer','culture','competitive','brand')),
  term         text not null,
  reading      jsonb not null default '{}'::jsonb,
  unique (business_id, captured_on, signal, term)
);
alter table public.signal_readings enable row level security;
create index if not exists signal_readings_lookup_idx
  on public.signal_readings (business_id, signal, captured_on desc);
drop policy if exists "signal_readings: via business" on public.signal_readings;
create policy "signal_readings: via business" on public.signal_readings
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------- the learning loop, v1
-- A run's real results feed the brand's own baseline directly.
alter table public.pick_runs
  add column if not exists impressions integer,
  add column if not exists clicks integer,
  add column if not exists conversions integer,
  add column if not exists revenue_usd numeric;
