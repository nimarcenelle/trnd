-- TRND initial schema. Every table gets RLS; a user reaches rows only through a
-- business they own. Service-role key is used only by cron routes.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: own row select" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles: own row update" on public.profiles
  for update using (id = (select auth.uid()));

-- Auto-provision a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- businesses
create table public.businesses (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  name               text not null,
  category           text not null,
  city               text not null,
  region             text,
  country            text not null default 'US',
  lat                double precision,
  lng                double precision,
  radius_miles       integer not null default 20,
  website            text,
  price_band         text,
  brand_voice_notes  text,
  created_at         timestamptz not null default now()
);
alter table public.businesses enable row level security;
create index businesses_owner_idx on public.businesses (owner_id);

create policy "businesses: owner all" on public.businesses
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Convenience predicate reused by child-table policies.
create or replace function public.owns_business(b_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = b_id and b.owner_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------- services
create table public.services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  description  text,
  price_cents  integer,
  is_active    boolean not null default true
);
alter table public.services enable row level security;
create index services_business_idx on public.services (business_id);

create policy "services: via business" on public.services
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------------- signals
-- Shared market data: readable by any signed-in user, written only by cron
-- (service role bypasses RLS; no insert/update policies on purpose).
create table public.signals (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('google_trends','reddit','youtube','news','seed')),
  term             text not null,
  normalized_term  text not null,
  category         text not null,
  geo              text not null default 'US',
  metric_type      text not null,
  value            numeric,
  delta_pct        numeric,
  window_days      integer not null default 7,
  captured_at      timestamptz not null default now(),
  raw              jsonb
);
alter table public.signals enable row level security;
create unique index signals_daily_uniq
  on public.signals (source, normalized_term, geo, (captured_at::date));
create index signals_category_idx on public.signals (category, captured_at desc);

create policy "signals: authenticated read" on public.signals
  for select using ((select auth.role()) = 'authenticated');

-- ----------------------------------------------------------- signal_series
create table public.signal_series (
  id               uuid primary key default gen_random_uuid(),
  normalized_term  text not null,
  geo              text not null default 'US',
  day              date not null,
  value            numeric not null
);
alter table public.signal_series enable row level security;
create unique index signal_series_uniq on public.signal_series (normalized_term, geo, day);

create policy "signal_series: authenticated read" on public.signal_series
  for select using ((select auth.role()) = 'authenticated');

-- ------------------------------------------------------------ opportunities
create table public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  signal_id           uuid not null references public.signals (id) on delete cascade,
  week_of             date not null,
  score               numeric(3,1) not null,
  rationale           text not null,
  matched_service_id  uuid references public.services (id) on delete set null,
  competitor_gap      text,
  status              text not null default 'new'
                      check (status in ('new','accepted','dismissed','launched')),
  created_at          timestamptz not null default now(),
  unique (business_id, signal_id, week_of)
);
alter table public.opportunities enable row level security;
create index opportunities_business_week_idx on public.opportunities (business_id, week_of desc);

create policy "opportunities: via business select" on public.opportunities
  for select using (public.owns_business(business_id));
create policy "opportunities: via business update" on public.opportunities
  for update using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ---------------------------------------------------------------- campaigns
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  business_id     uuid not null references public.businesses (id) on delete cascade,
  angle           text not null,
  hook            text not null,
  offer           text not null,
  audience        jsonb not null default '{}'::jsonb,
  channel         text not null default 'meta' check (channel in ('meta','google','tiktok')),
  status          text not null default 'draft'
                  check (status in ('draft','exported','live','complete')),
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now()
);
alter table public.campaigns enable row level security;
create index campaigns_business_idx on public.campaigns (business_id, created_at desc);

create policy "campaigns: via business" on public.campaigns
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ---------------------------------------------------------------- creatives
create table public.creatives (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  kind           text not null check (kind in
                 ('headline','primary_text','script','static_brief','landing_copy')),
  content        text not null,
  variant_index  integer not null default 0
);
alter table public.creatives enable row level security;
create index creatives_campaign_idx on public.creatives (campaign_id);

create policy "creatives: via campaign" on public.creatives
  for all using (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)))
  with check (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)));

-- ---------------------------------------------------------- campaign_results
-- Manual entry in the MVP; `source` leaves room for a Meta API sync later.
create table public.campaign_results (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  impressions    integer,
  clicks         integer,
  spend_cents    integer,
  bookings       integer,
  revenue_cents  integer,
  ctr            numeric,
  cpa_cents      integer,
  source         text not null default 'manual' check (source in ('manual','meta_api')),
  recorded_at    timestamptz not null default now()
);
alter table public.campaign_results enable row level security;
create index campaign_results_campaign_idx on public.campaign_results (campaign_id);

create policy "campaign_results: via campaign" on public.campaign_results
  for all using (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)))
  with check (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)));

-- ---------------------------------------------------------------- learnings
-- Aggregated, anonymized lift by category/geo/angle. Shared read; cron write.
create table public.learnings (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  geo_bucket   text not null,
  angle_type   text not null,
  lift         numeric not null,
  sample_size  integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (category, geo_bucket, angle_type)
);
alter table public.learnings enable row level security;

create policy "learnings: authenticated read" on public.learnings
  for select using ((select auth.role()) = 'authenticated');

-- ------------------------------------------------------------- demo_requests
-- Public marketing form. Anyone may insert; only service role reads.
create table public.demo_requests (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text not null,
  business_name  text not null,
  category       text,
  monthly_spend  text,
  created_at     timestamptz not null default now()
);
alter table public.demo_requests enable row level security;

create policy "demo_requests: public insert" on public.demo_requests
  for insert with check (true);
