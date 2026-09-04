-- The Merciv-for-SMBs layer: connected accounts, named-competitor tracking,
-- voice-of-customer reviews, and proactive alerts — plus platform linkage on
-- campaigns so launched ads sync their own results back.

-- ------------------------------------------------------------- connections
create table public.connections (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  provider          text not null check (provider in ('meta','google_ads','google_business')),
  status            text not null default 'connected' check (status in ('connected','error','revoked')),
  account_id        text,
  account_name      text,
  access_token      text not null,
  refresh_token     text,
  token_expires_at  timestamptz,
  scopes            text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, provider)
);
alter table public.connections enable row level security;
create policy "connections: via business" on public.connections
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------- competitors
create table public.competitors (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  website      text,
  place_id     text,
  created_at   timestamptz not null default now(),
  unique (business_id, name)
);
alter table public.competitors enable row level security;
create policy "competitors: via business" on public.competitors
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create table public.competitor_reads (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.competitors (id) on delete cascade,
  business_id    uuid not null references public.businesses (id) on delete cascade,
  kind           text not null check (kind in ('ads','reviews','site')),
  value          numeric,
  rating         numeric,
  summary        text not null,
  raw            jsonb not null default '{}'::jsonb,
  captured_at    timestamptz not null default now(),
  day            date not null default current_date,
  unique (competitor_id, kind, day)
);
alter table public.competitor_reads enable row level security;
create index competitor_reads_business_idx on public.competitor_reads (business_id, captured_at desc);
create policy "competitor_reads: via business" on public.competitor_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------------- reviews
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  competitor_id  uuid references public.competitors (id) on delete cascade,
  author         text not null,
  rating         numeric not null,
  text           text not null,
  published_at   timestamptz,
  source         text not null default 'google' check (source in ('google','seed')),
  captured_at    timestamptz not null default now(),
  unique (business_id, competitor_id, author, text)
);
alter table public.reviews enable row level security;
create index reviews_business_idx on public.reviews (business_id, published_at desc);
create policy "reviews: via business" on public.reviews
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create table public.review_digests (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null unique references public.businesses (id) on delete cascade,
  review_count  integer not null default 0,
  themes        text[] not null default '{}',
  copy_hooks    text[] not null default '{}',
  watchouts     text[] not null default '{}',
  model_used    text not null,
  created_at    timestamptz not null default now()
);
alter table public.review_digests enable row level security;
create policy "review_digests: via business" on public.review_digests
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------------ alerts
create table public.alerts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  kind         text not null check (kind in ('demand_spike','competitor_ads','seasonal_window','campaign_performance','report_ready')),
  title        text not null,
  body         text not null,
  href         text not null,
  dedupe_key   text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (business_id, dedupe_key)
);
alter table public.alerts enable row level security;
create index alerts_business_idx on public.alerts (business_id, created_at desc);
create policy "alerts: via business" on public.alerts
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------- campaign platform linkage
alter table public.campaigns add column external_id text;
alter table public.campaigns add column external_status text;

-- (The signals source check is owned by 0011 — the full live union,
-- dataforseo included. Rewriting it here with a partial list broke ingest.)
