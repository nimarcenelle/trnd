-- TRND rebuild: always-on surveillance of rivals' Meta ads.
--
-- Five tables. A brand (one per owner) watches rivals; every ad a rival runs
-- is kept with when we first and last saw it; each scan writes the changes it
-- found and a report the model wrote from them. The tables of the old product
-- (businesses, competitors, picks, ...) are untouched and unused; drop them
-- whenever convenient. Safe to re-run.

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  name text not null,
  -- What the brand sells and to whom, as the model read it off the site.
  summary text,
  category text,
  plan text not null default 'trial',
  plan_status text not null default 'active',
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  scan_status text not null default 'idle', -- idle | running | error
  scan_error text,
  scan_started_at timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.rivals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  website text,
  -- Why the model (or the owner) thinks this is a rival.
  reason text,
  -- The advertiser's Facebook Page, resolved on the first scan that finds it.
  page_id text,
  page_name text,
  source text not null default 'ai', -- ai | owner
  last_scraped_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists rivals_brand_idx on public.rivals (brand_id);

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  archive_id text not null,
  page_name text,
  body text,
  title text,
  cta text,
  link_url text,
  format text, -- video | image | carousel | dco | unknown
  image_url text,
  video_url text,
  platforms text[] not null default '{}',
  variants int not null default 1,
  started_at date,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  stopped_at timestamptz,
  -- The model's read of the ad: angle, hook, offer.
  angle text,
  hook text,
  offer text,
  unique (rival_id, archive_id)
);
create index if not exists ads_brand_idx on public.ads (brand_id, active);

create table if not exists public.ad_changes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  ad_id uuid references public.ads(id) on delete cascade,
  kind text not null, -- launched | stopped | proven
  detected_at timestamptz not null default now()
);
create index if not exists ad_changes_brand_idx on public.ad_changes (brand_id, detected_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null, -- baseline | update
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists reports_brand_idx on public.reports (brand_id, created_at desc);

-- Owners read their own rows. Every write goes through the server with the
-- service role after the session is checked, so there are no write policies.
alter table public.brands enable row level security;
alter table public.rivals enable row level security;
alter table public.ads enable row level security;
alter table public.ad_changes enable row level security;
alter table public.reports enable row level security;

drop policy if exists brands_owner_read on public.brands;
create policy brands_owner_read on public.brands for select using (owner_id = auth.uid());

drop policy if exists rivals_owner_read on public.rivals;
create policy rivals_owner_read on public.rivals for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

drop policy if exists ads_owner_read on public.ads;
create policy ads_owner_read on public.ads for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

drop policy if exists ad_changes_owner_read on public.ad_changes;
create policy ad_changes_owner_read on public.ad_changes for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

drop policy if exists reports_owner_read on public.reports;
create policy reports_owner_read on public.reports for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
