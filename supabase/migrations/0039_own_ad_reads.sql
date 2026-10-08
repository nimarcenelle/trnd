-- 0039 — the brand's own live ads, read daily.
--
-- Competitors' ads have been read daily into competitor_reads since 0013.
-- The brand's own live ads are read the same way, from the same public Ad
-- Library, so the board compares like with like: what they run against
-- what you run, and what changed since yesterday on both sides.

create table if not exists public.own_ad_reads (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  active       integer not null default 0,
  raw          jsonb not null default '{}'::jsonb,
  captured_at  timestamptz not null default now(),
  day          date not null default current_date,
  unique (business_id, day)
);
alter table public.own_ad_reads enable row level security;
create index if not exists own_ad_reads_business_idx on public.own_ad_reads (business_id, captured_at desc);
drop policy if exists "own_ad_reads: via business" on public.own_ad_reads;
create policy "own_ad_reads: via business" on public.own_ad_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
