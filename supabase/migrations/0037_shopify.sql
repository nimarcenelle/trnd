-- The brand's own store, read from Shopify with a custom-app Admin API
-- token: products with their cost (so a brief knows what an offer can
-- afford), variants, stock, the last 30 days of orders split new against
-- returning, and the discount codes that are live. Run after 0036.
-- Idempotent: pasted by hand, safe to re-run.

alter table public.connections drop constraint if exists connections_provider_check;
alter table public.connections
  add constraint connections_provider_check check (provider in ('meta','google_ads','google_business','shopify'));

alter table public.services
  add column if not exists cost_cents integer,
  add column if not exists external_id text,
  add column if not exists variants jsonb not null default '[]'::jsonb;
create index if not exists services_external_idx on public.services (business_id, external_id);

-- One read per brand per day: the store's last 30 days as of that day.
create table if not exists public.store_reads (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses (id) on delete cascade,
  captured_on              date not null,
  provider                 text not null default 'shopify',
  orders_30d               integer,
  new_customers_30d        integer,
  returning_customers_30d  integer,
  revenue_30d_cents        integer,
  aov_cents                integer,
  discount_codes           jsonb not null default '[]'::jsonb,
  raw                      jsonb,
  created_at               timestamptz not null default now(),
  unique (business_id, captured_on)
);
alter table public.store_reads enable row level security;
create index if not exists store_reads_business_idx on public.store_reads (business_id, captured_on desc);
drop policy if exists "store_reads: via business" on public.store_reads;
create policy "store_reads: via business" on public.store_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
