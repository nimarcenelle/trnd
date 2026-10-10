-- TRND: every migration, 0001 through 0039, in order. Paste into the Supabase SQL editor and run once.
-- Generated from supabase/migrations/ and made re-runnable: every create has "if not exists", every policy and constraint is dropped before it is re-created. Running it twice, or after a partial run, is safe.


-- ============================================================
-- 0001_init.sql
-- ============================================================
-- TRND initial schema. Every table gets RLS; a user reaches rows only through a
-- business they own. Service-role key is used only by cron routes.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: own row select" on public.profiles;
create policy "profiles: own row select" on public.profiles
  for select using (id = (select auth.uid()));
drop policy if exists "profiles: own row update" on public.profiles;
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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- businesses
create table if not exists public.businesses (
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
create index if not exists businesses_owner_idx on public.businesses (owner_id);

drop policy if exists "businesses: owner all" on public.businesses;
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
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  description  text,
  price_cents  integer,
  is_active    boolean not null default true
);
alter table public.services enable row level security;
create index if not exists services_business_idx on public.services (business_id);

drop policy if exists "services: via business" on public.services;
create policy "services: via business" on public.services
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------------- signals
-- Shared market data: readable by any signed-in user, written only by cron
-- (service role bypasses RLS; no insert/update policies on purpose).
create table if not exists public.signals (
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
  -- The UTC day, stored: a bare captured_at::date depends on the session
  -- timezone, which Postgres rejects in an index expression (42P17).
  captured_day     date not null generated always as (((captured_at at time zone 'utc'))::date) stored,
  raw              jsonb
);
alter table public.signals enable row level security;
create unique index if not exists signals_daily_uniq
  on public.signals (source, normalized_term, geo, captured_day);
create index if not exists signals_category_idx on public.signals (category, captured_at desc);

drop policy if exists "signals: authenticated read" on public.signals;
create policy "signals: authenticated read" on public.signals
  for select using ((select auth.role()) = 'authenticated');

-- ----------------------------------------------------------- signal_series
create table if not exists public.signal_series (
  id               uuid primary key default gen_random_uuid(),
  normalized_term  text not null,
  geo              text not null default 'US',
  day              date not null,
  value            numeric not null
);
alter table public.signal_series enable row level security;
create unique index if not exists signal_series_uniq on public.signal_series (normalized_term, geo, day);

drop policy if exists "signal_series: authenticated read" on public.signal_series;
create policy "signal_series: authenticated read" on public.signal_series
  for select using ((select auth.role()) = 'authenticated');

-- ------------------------------------------------------------ opportunities
create table if not exists public.opportunities (
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
create index if not exists opportunities_business_week_idx on public.opportunities (business_id, week_of desc);

drop policy if exists "opportunities: via business select" on public.opportunities;
create policy "opportunities: via business select" on public.opportunities
  for select using (public.owns_business(business_id));
drop policy if exists "opportunities: via business update" on public.opportunities;
create policy "opportunities: via business update" on public.opportunities
  for update using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ---------------------------------------------------------------- campaigns
create table if not exists public.campaigns (
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
create index if not exists campaigns_business_idx on public.campaigns (business_id, created_at desc);

drop policy if exists "campaigns: via business" on public.campaigns;
create policy "campaigns: via business" on public.campaigns
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ---------------------------------------------------------------- creatives
create table if not exists public.creatives (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  kind           text not null check (kind in
                 ('headline','primary_text','script','static_brief','landing_copy')),
  content        text not null,
  variant_index  integer not null default 0
);
alter table public.creatives enable row level security;
create index if not exists creatives_campaign_idx on public.creatives (campaign_id);

drop policy if exists "creatives: via campaign" on public.creatives;
create policy "creatives: via campaign" on public.creatives
  for all using (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)))
  with check (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)));

-- ---------------------------------------------------------- campaign_results
-- Manual entry in the MVP; `source` leaves room for a Meta API sync later.
create table if not exists public.campaign_results (
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
create index if not exists campaign_results_campaign_idx on public.campaign_results (campaign_id);

drop policy if exists "campaign_results: via campaign" on public.campaign_results;
create policy "campaign_results: via campaign" on public.campaign_results
  for all using (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)))
  with check (public.owns_business(
    (select c.business_id from public.campaigns c where c.id = campaign_id)));

-- ---------------------------------------------------------------- learnings
-- Aggregated, anonymized lift by category/geo/angle. Shared read; cron write.
create table if not exists public.learnings (
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

drop policy if exists "learnings: authenticated read" on public.learnings;
create policy "learnings: authenticated read" on public.learnings
  for select using ((select auth.role()) = 'authenticated');

-- ------------------------------------------------------------- demo_requests
-- Public marketing form. Anyone may insert; only service role reads.
create table if not exists public.demo_requests (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  email          text not null,
  business_name  text not null,
  category       text,
  monthly_spend  text,
  created_at     timestamptz not null default now()
);
alter table public.demo_requests enable row level security;

drop policy if exists "demo_requests: public insert" on public.demo_requests;
create policy "demo_requests: public insert" on public.demo_requests
  for insert with check (true);


-- ============================================================
-- 0002_learning_provenance_and_briefs.sql
-- ============================================================
-- 1) Learnings carry provenance: seeded priors are never presented as real
--    campaign history. 'measured' rows come only from recorded results.
alter table public.learnings
  add column if not exists source text not null default 'measured'
  check (source in ('seed', 'measured'));

-- 2) Business briefs — the positioning read generated when a business joins:
--    what they do well, their moat, edges to press in ads, and what to avoid.
create table if not exists public.business_briefs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null unique references public.businesses (id) on delete cascade,
  does_well       text[] not null default '{}',
  moat            text not null,
  advantages      text[] not null default '{}',
  watchouts       text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now()
);
alter table public.business_briefs enable row level security;

drop policy if exists "business_briefs: via business" on public.business_briefs;
create policy "business_briefs: via business" on public.business_briefs
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0003_full_business_analysis.sql
-- ============================================================
-- Business briefs grow into a full analysis: positioning, customer segments,
-- local market context, pricing read, seasonality, and concrete first moves.
-- Defaults keep pre-existing rows valid; the app regenerates any brief whose
-- prompt_version predates the current one.
alter table public.business_briefs
  add column if not exists positioning       text   not null default '',
  add column if not exists customer_segments text[] not null default '{}',
  add column if not exists market_context    text   not null default '',
  add column if not exists pricing_read      text   not null default '',
  add column if not exists seasonality       text   not null default '',
  add column if not exists first_moves       text[] not null default '{}';


-- ============================================================
-- 0004_tiktok_source.sql
-- ============================================================
-- TikTok Creative Center joins the signal sources.
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'reddit', 'youtube', 'news', 'tiktok', 'seed'));


-- ============================================================
-- 0005_brief_watch_terms.sql
-- ============================================================
-- The founding analysis produces the business's demand watchlist: the search
-- phrases its real customers use, fed into signal ingestion so TRND watches
-- what THIS business sells — not just its category.
alter table public.business_briefs
  add column if not exists watch_terms text[] not null default '{}';


-- ============================================================
-- 0006_business_photos.sql
-- ============================================================
-- Real photos harvested from the business's own website during onboarding —
-- ad previews and creative directions use these instead of placeholders.
alter table public.businesses
  add column if not exists photo_urls text[] not null default '{}';


-- ============================================================
-- 0007_meta_ads_source.sql
-- ============================================================
-- Meta Ad Library joins the signal sources: real competitor ad-saturation
-- reads (metric_type 'ad_saturation') replacing the news-coverage proxy.
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'seed'));


-- ============================================================
-- 0008_subscriptions.sql
-- ============================================================
-- Billing: one subscription row per business. Every business starts on a
-- 14-day trial; Stripe webhooks (service role) move it to a paid plan.
-- Owners can read their own row; all writes go through the service role so
-- a client can never grant itself a plan.
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null unique references public.businesses (id) on delete cascade,
  plan                    text not null default 'trial'
                          check (plan in ('trial', 'baseline', 'pro')),
  status                  text not null default 'trialing'
                          check (status in ('trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  current_period_end      timestamptz,
  trial_ends_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: owner reads" on public.subscriptions;
create policy "subscriptions: owner reads" on public.subscriptions
  for select using (public.owns_business(business_id));

-- The trial row is created alongside the business by the app (owner insert);
-- plan/status changes arrive only via the service role, which bypasses RLS.
drop policy if exists "subscriptions: owner creates trial" on public.subscriptions;
create policy "subscriptions: owner creates trial" on public.subscriptions
  for insert with check (
    public.owns_business(business_id) and plan = 'trial' and status = 'trialing'
  );

create index if not exists subscriptions_stripe_sub_idx on public.subscriptions (stripe_subscription_id);


-- ============================================================
-- 0009_local_signal_sources.sql
-- ============================================================
-- Detect v2: two new local-first signal sources.
-- 'weather'         — Open-Meteo forecast-derived demand triggers per metro
--                     (metric_type 'weather_trigger', heuristic deltas
--                     flagged in raw).
-- 'google_suggest'  — autocomplete intent + discovery reads
--                     (metric_type 'search_intent').
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'weather', 'seed'));


-- ============================================================
-- 0010_brief_depth.sql
-- ============================================================
-- Brief v5: the founding analysis stops being a summary and becomes the
-- business's whole signal identity — a deep demand watchlist plus its own
-- classification vocabulary and communities, so the category configs are
-- scaffolding rather than the backbone.
alter table public.business_briefs
  add column if not exists lexicon text[] not null default '{}',
  add column if not exists subreddits text[] not null default '{}';


-- ============================================================
-- 0011_snapshot_source_and_relevance.sql
-- ============================================================
-- Evergreen demand terms from the founding analysis join the signal sources
-- ('snapshot'), and DataForSEO search volumes get their source ('dataforseo'):
-- when the trend pool doesn't fit a business, its own watch terms become the
-- week's candidates instead of least-bad junk. The check is the FULL union of
-- every live source — replacing it with a partial list breaks daily ingest.
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in ('google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok', 'meta_ads', 'weather', 'dataforseo', 'snapshot', 'seed'));

-- The relevance judge's 0-1 fit, persisted so screens can re-derive the same
-- gated score breakdown the ranking used (null = ranking was never judged).
alter table public.opportunities add column if not exists relevance numeric(3,2);


-- ============================================================
-- 0012_intel_notes.sql
-- ============================================================
-- The analyst note that opens each week's intel report — the one AI-written
-- (or deterministic-fallback) block on an otherwise data-derived page.
-- Persisted per (business, week) so the report is stable within a week.
create table if not exists public.intel_notes (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  week_of         date not null,
  headline        text not null,
  narrative       text[] not null default '{}',
  actions         text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now(),
  unique (business_id, week_of)
);
alter table public.intel_notes enable row level security;
create index if not exists intel_notes_business_week_idx on public.intel_notes (business_id, week_of desc);

drop policy if exists "intel_notes: via business" on public.intel_notes;
create policy "intel_notes: via business" on public.intel_notes
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0013_connections_competitors_reviews_alerts.sql
-- ============================================================
-- The Merciv-for-SMBs layer: connected accounts, named-competitor tracking,
-- voice-of-customer reviews, and proactive alerts — plus platform linkage on
-- campaigns so launched ads sync their own results back.

-- ------------------------------------------------------------- connections
create table if not exists public.connections (
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
drop policy if exists "connections: via business" on public.connections;
create policy "connections: via business" on public.connections
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------- competitors
create table if not exists public.competitors (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  website      text,
  place_id     text,
  created_at   timestamptz not null default now(),
  unique (business_id, name)
);
alter table public.competitors enable row level security;
drop policy if exists "competitors: via business" on public.competitors;
create policy "competitors: via business" on public.competitors
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create table if not exists public.competitor_reads (
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
create index if not exists competitor_reads_business_idx on public.competitor_reads (business_id, captured_at desc);
drop policy if exists "competitor_reads: via business" on public.competitor_reads;
create policy "competitor_reads: via business" on public.competitor_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------------- reviews
create table if not exists public.reviews (
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
create index if not exists reviews_business_idx on public.reviews (business_id, published_at desc);
drop policy if exists "reviews: via business" on public.reviews;
create policy "reviews: via business" on public.reviews
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

create table if not exists public.review_digests (
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
drop policy if exists "review_digests: via business" on public.review_digests;
create policy "review_digests: via business" on public.review_digests
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------------ alerts
create table if not exists public.alerts (
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
create index if not exists alerts_business_idx on public.alerts (business_id, created_at desc);
drop policy if exists "alerts: via business" on public.alerts;
create policy "alerts: via business" on public.alerts
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------- campaign platform linkage
alter table public.campaigns add column if not exists external_id text;
alter table public.campaigns add column if not exists external_status text;

-- (The signals source check is owned by 0011 — the full live union,
-- dataforseo included. Rewriting it here with a partial list broke ingest.)


-- ============================================================
-- 0014_prospector.sql
-- ============================================================
-- Internal growth tool: discovered local-business leads for founder outreach.
-- Service-role only — RLS is enabled with no user policies on purpose, so the
-- anon/user keys can never read or write prospect data.

create table if not exists public.prospect_leads (
  id            uuid primary key default gen_random_uuid(),
  place_id      text not null unique,
  name          text not null,
  category      text,
  address       text,
  city          text,
  region        text,
  phone         text,
  website       text,
  platform      text not null default 'None',
  emails        text[] not null default '{}',
  best_email    text,
  email_status  text not null default 'none' check (email_status in ('verified','risky','none')),
  signal        text not null default '',
  ad_pixels     text[] not null default '{}',
  status        text not null default 'new' check (status in ('new','queued','sent','opted_out','skipped')),
  search_query  text not null default '',
  sent_at       timestamptz,
  sent_subject  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.prospect_leads enable row level security;

create index if not exists prospect_leads_status_idx on public.prospect_leads (status);
create index if not exists prospect_leads_best_email_idx on public.prospect_leads (best_email);


-- ============================================================
-- 0015_demo_request_website.sql
-- ============================================================
-- Demo requests capture the website so the pre-call sample can be built
-- from what the business actually sells (the same read onboarding does).
alter table public.demo_requests add column if not exists website text;


-- ============================================================
-- 0016_prospector_fit.sql
-- ============================================================
-- Prospector fit signals: Google rating / review count and distance from the
-- search center ride along with each lead so the fit score can use them.
-- The store tolerates these columns being absent (it retries without them),
-- so a deploy ahead of this migration still saves leads — just unscored on
-- these three inputs.

alter table public.prospect_leads
  add column if not exists rating         numeric(2,1),
  add column if not exists review_count   integer,
  add column if not exists distance_miles numeric(6,1);


-- ============================================================
-- 0017_pick_reads.sql
-- ============================================================
-- The analyst's read on one pick: 2-3 model-written paragraphs on why this
-- term, for this business, this week — plus the questions an owner would ask
-- next, which seed the pick's Ask box. One row per opportunity; the
-- prompt_version carries a fingerprint of the facts it was written from, so
-- a read whose facts moved (new score, new match) is rewritten, not shown.
create table if not exists public.pick_reads (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  business_id     uuid not null references public.businesses (id) on delete cascade,
  paragraphs      text[] not null default '{}',
  questions       text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now(),
  unique (opportunity_id)
);
alter table public.pick_reads enable row level security;
create index if not exists pick_reads_business_idx on public.pick_reads (business_id);

drop policy if exists "pick_reads: via business" on public.pick_reads;
create policy "pick_reads: via business" on public.pick_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0018_one_campaign_per_pick.sql
-- ============================================================
-- The week's #1 pick is now built without being asked — by the Monday cron
-- and by the dashboard after its response — so two writers can race for the
-- same opportunity. One campaign per pick was always the assumption
-- (getCampaignByOpportunity reads a single row); make the database hold it.
create unique index if not exists campaigns_opportunity_uniq
  on public.campaigns (opportunity_id);


-- ============================================================
-- 0019_standing_questions.sql
-- ============================================================
-- Standing questions: what the owner wants answered every week. Re-answered
-- each Monday by the weekly cron against that week's facts and memory, with
-- one line on what moved since the previous answer. The evergreen loop —
-- a question that never closes, answered before it's asked.
create table if not exists public.standing_questions (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  question         text not null,
  active           boolean not null default true,
  answer           text[] not null default '{}',
  changed          text,
  answered_week    date,
  previous_answer  text[] not null default '{}',
  model_used       text,
  created_at       timestamptz not null default now()
);
alter table public.standing_questions enable row level security;
create index if not exists standing_questions_business_idx on public.standing_questions (business_id, created_at);

drop policy if exists "standing_questions: via business" on public.standing_questions;
create policy "standing_questions: via business" on public.standing_questions
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0020_business_documents.sql
-- ============================================================
-- The owner's own knowledge next to the market's: uploaded menus, sales
-- exports, brand guides, past ad results. The raw file is never stored —
-- text is extracted on upload and digested into facts; both live here.
create table if not exists public.business_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  mime         text not null,
  bytes        integer not null default 0,
  text         text not null default '',
  digest       jsonb not null default '{}'::jsonb,
  model_used   text not null,
  created_at   timestamptz not null default now()
);
alter table public.business_documents enable row level security;
create index if not exists business_documents_business_idx on public.business_documents (business_id, created_at desc);

drop policy if exists "business_documents: via business" on public.business_documents;
create policy "business_documents: via business" on public.business_documents
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0021_social_signal_sources.sql
-- ============================================================
-- X and Instagram join the signal sources.
--
-- The demand score is a weighted composite across every place attention
-- actually shows up, and it was running on two live inputs. These are the
-- next two. Both adapters are key-gated and register unavailable without
-- credentials, so this constraint can land before either is switched on.
--
-- The check is the FULL union of every live source — replacing it with a
-- partial list breaks daily ingest.
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals drop constraint if exists signals_source_check;
alter table public.signals
  add constraint signals_source_check
  check (source in (
    'google_trends', 'google_suggest', 'reddit', 'youtube', 'news', 'tiktok',
    'meta_ads', 'weather', 'dataforseo', 'snapshot', 'x', 'instagram', 'seed'
  ));


-- ============================================================
-- 0022_four_signals.sql
-- ============================================================
-- The four signal types the recommendation is built from — customer,
-- competitive, cultural, brand — need places to keep what they read.
--
-- Brand + competitive: social handles on the business and on each rival,
-- and the posts read from those accounts. Brand: the owner's own past ads
-- and how they did (an Ads Manager export, a synced account, or a hand
-- entry). Customer: the one target customer the brief names, with the words
-- they use — signal terms are judged against that vocabulary.
--
-- Idempotent: migrations are pasted into the SQL editor by hand, and a paste
-- that half-ran must be safe to paste again.

alter table public.businesses
  add column if not exists social_handles jsonb not null default '{}'::jsonb,
  -- Online brands (the DTC customer) compete by product and ads, nationally;
  -- local businesses by place. Existing rows are local.
  add column if not exists market text not null default 'local',
  -- A band like "20-50k": sizes test budgets and the stakes line.
  add column if not exists monthly_ad_spend text,
  add column if not exists ad_platforms text[] not null default '{}';

alter table public.businesses drop constraint if exists businesses_market_check;
alter table public.businesses drop constraint if exists businesses_market_check;
alter table public.businesses
  add constraint businesses_market_check check (market in ('online','local'));

alter table public.competitors
  add column if not exists social_handles jsonb not null default '{}'::jsonb,
  add column if not exists directness numeric,
  add column if not exists directness_reason text;

alter table public.business_briefs
  add column if not exists target_customer jsonb not null default '{}'::jsonb;

-- Social and Google-ads reads join the dated observations on a rival.
alter table public.competitor_reads drop constraint if exists competitor_reads_kind_check;
alter table public.competitor_reads drop constraint if exists competitor_reads_kind_check;
alter table public.competitor_reads
  add constraint competitor_reads_kind_check
  check (kind in ('ads','reviews','site','social','google_ads'));

-- ------------------------------------------------------------ social_posts
create table if not exists public.social_posts (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  competitor_id  uuid references public.competitors (id) on delete cascade,
  platform       text not null check (platform in ('instagram','tiktok','facebook')),
  external_id    text not null,
  url            text not null default '',
  caption        text not null default '',
  media_type     text not null default 'image' check (media_type in ('video','image','carousel','text')),
  posted_at      timestamptz,
  likes          integer not null default 0,
  comments       integer not null default 0,
  shares         integer not null default 0,
  views          integer not null default 0,
  is_ad          boolean not null default false,
  kind           text check (kind in ('promo','new_item','event','behind_scenes','proof','other')),
  captured_at    timestamptz not null default now()
);
alter table public.social_posts enable row level security;
create unique index if not exists social_posts_identity_idx
  on public.social_posts (business_id, coalesce(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), platform, external_id);
create index if not exists social_posts_business_idx on public.social_posts (business_id, posted_at desc);
drop policy if exists "social_posts: via business" on public.social_posts;
create policy "social_posts: via business" on public.social_posts
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- -------------------------------------------------------------- ad_history
create table if not exists public.ad_history (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  platform       text not null default 'meta' check (platform in ('meta','google','tiktok','other')),
  campaign_name  text not null,
  ad_name        text,
  copy           text,
  impressions    integer,
  clicks         integer,
  spend_cents    integer,
  results        integer,
  ctr            numeric,
  started_on     date,
  ended_on       date,
  source         text not null default 'meta_export' check (source in ('meta_export','google_export','manual','meta_api')),
  created_at     timestamptz not null default now(),
  unique (business_id, platform, campaign_name, ad_name, started_on)
);
alter table public.ad_history enable row level security;
create index if not exists ad_history_business_idx on public.ad_history (business_id, started_on desc);
drop policy if exists "ad_history: via business" on public.ad_history;
create policy "ad_history: via business" on public.ad_history
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));


-- ============================================================
-- 0023_picks.sql
-- ============================================================
-- The pick page rebuild. A pick ends at "here is the ad, here is the bet,
-- here is when to kill it": a finding, one metric, a bet with a kill rule,
-- three finished scripts, an optional guardrail, and the evidence behind it
-- by signal. Everything is written upstream by the weekly job, so the list
-- and detail pages read rows and never call a model.
--
-- Columns are business_id (not brand_id) to match every other table and the
-- owns_business() policy helper. Idempotent: pasted by hand, safe to re-run.

-- ------------------------------------------------------------------ picks
create table if not exists public.picks (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  opportunity_id     uuid references public.opportunities (id) on delete set null,
  week_of            date not null,
  rank               integer not null check (rank between 1 and 5),
  geo                text not null default 'US',
  term               text not null,
  finding            text not null,
  metric_label       text not null,
  metric_value       numeric,
  metric_delta_pct   numeric,
  metric_window      text not null check (metric_window in ('week','30d')),
  sparkline          jsonb not null default '[]'::jsonb,
  bet_what           text not null,
  bet_budget_usd     numeric not null,
  bet_duration_days  integer not null,
  bet_kill_rule      text not null,
  guardrail          text,
  -- The Opportunity Grade at generation time, kept on the pick so the page
  -- and the later weight regression both read what the brand was shown.
  grade              text check (grade in ('A+','A','B+','B','C','Hold')),
  grade_score        numeric,
  signal_scores      jsonb not null default '{}'::jsonb,
  status             text not null default 'draft' check (status in ('draft','ready','published')),
  created_at         timestamptz not null default now()
);
alter table public.picks
  add column if not exists grade text,
  add column if not exists grade_score numeric,
  add column if not exists signal_scores jsonb not null default '{}'::jsonb;
alter table public.picks enable row level security;
create index if not exists picks_business_week_idx on public.picks (business_id, week_of, rank);
drop policy if exists "picks: via business" on public.picks;
create policy "picks: via business" on public.picks
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ----------------------------------------------------------- pick_evidence
create table if not exists public.pick_evidence (
  id            uuid primary key default gen_random_uuid(),
  pick_id       uuid not null references public.picks (id) on delete cascade,
  signal        text not null check (signal in ('customer','culture','competitive','brand')),
  claim         text not null,
  source_url    text,
  source_label  text,
  position      integer not null default 0
);
alter table public.pick_evidence enable row level security;
create index if not exists pick_evidence_pick_idx on public.pick_evidence (pick_id, position);
drop policy if exists "pick_evidence: via pick" on public.pick_evidence;
create policy "pick_evidence: via pick" on public.pick_evidence
  for all using (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)))
  with check (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)));

-- ------------------------------------------------------------ pick_scripts
create table if not exists public.pick_scripts (
  id                uuid primary key default gen_random_uuid(),
  pick_id           uuid not null references public.picks (id) on delete cascade,
  position          integer not null default 0,
  variant_label     text not null,
  thesis            text not null,
  hook              text not null,
  beats             jsonb not null default '[]'::jsonb,
  cta               text not null,
  duration_seconds  integer not null check (duration_seconds between 5 and 180)
);
alter table public.pick_scripts enable row level security;
create index if not exists pick_scripts_pick_idx on public.pick_scripts (pick_id, position);
drop policy if exists "pick_scripts: via pick" on public.pick_scripts;
create policy "pick_scripts: via pick" on public.pick_scripts
  for all using (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)))
  with check (exists (select 1 from public.picks p where p.id = pick_id and public.owns_business(p.business_id)));

-- ----------------------------------------------------------- pick_feedback
create table if not exists public.pick_feedback (
  id           uuid primary key default gen_random_uuid(),
  pick_id      uuid not null references public.picks (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  action       text not null check (action in ('running','dismissed')),
  reason       text check (reason in ('wrong_customer','already_tried','off_brand','cant_shoot','other')),
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.pick_feedback enable row level security;
create index if not exists pick_feedback_business_idx on public.pick_feedback (business_id, created_at desc);
drop policy if exists "pick_feedback: via business" on public.pick_feedback;
create policy "pick_feedback: via business" on public.pick_feedback
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------------------------- pick_runs
create table if not exists public.pick_runs (
  id                uuid primary key default gen_random_uuid(),
  pick_id           uuid not null references public.picks (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  status            text not null default 'running' check (status in ('running','completed','killed')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  spend_usd         numeric,
  result_note       text,
  meta_campaign_id  text  -- reserved for the ad-account integration
);
alter table public.pick_runs enable row level security;
create index if not exists pick_runs_business_idx on public.pick_runs (business_id, started_at desc);
drop policy if exists "pick_runs: via business" on public.pick_runs;
create policy "pick_runs: via business" on public.pick_runs
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- --------------------------------------------- one week, one transaction
-- The weekly job writes a business's picks, their evidence and their scripts
-- in one call. A function body is one transaction: either the whole week
-- lands or none of it does. Picks someone already acted on (a run or a
-- dismissal) are kept; the rest of the week is replaced. The ready gate is
-- enforced here too: a pick without three scripts and one evidence row is a
-- draft whatever the caller asked for.
create or replace function public.replace_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
declare
  item jsonb;
  new_id uuid;
  wanted text;
begin
  delete from public.picks p
  where p.business_id = p_business_id
    and p.week_of = p_week_of
    and not exists (select 1 from public.pick_runs r where r.pick_id = p.id)
    and not exists (select 1 from public.pick_feedback f where f.pick_id = p.id);

  for item in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    wanted := coalesce(item->'pick'->>'status', 'draft');
    if jsonb_array_length(coalesce(item->'scripts', '[]'::jsonb)) < 3
       or jsonb_array_length(coalesce(item->'evidence', '[]'::jsonb)) < 1 then
      wanted := 'draft';
    end if;

    insert into public.picks (
      business_id, opportunity_id, week_of, rank, geo, term, finding,
      metric_label, metric_value, metric_delta_pct, metric_window, sparkline,
      bet_what, bet_budget_usd, bet_duration_days, bet_kill_rule, guardrail,
      grade, grade_score, signal_scores, status
    ) values (
      p_business_id,
      nullif(item->'pick'->>'opportunity_id', '')::uuid,
      p_week_of,
      (item->'pick'->>'rank')::integer,
      coalesce(item->'pick'->>'geo', 'US'),
      item->'pick'->>'term',
      item->'pick'->>'finding',
      item->'pick'->>'metric_label',
      nullif(item->'pick'->>'metric_value', '')::numeric,
      nullif(item->'pick'->>'metric_delta_pct', '')::numeric,
      item->'pick'->>'metric_window',
      coalesce(item->'pick'->'sparkline', '[]'::jsonb),
      item->'pick'->>'bet_what',
      (item->'pick'->>'bet_budget_usd')::numeric,
      (item->'pick'->>'bet_duration_days')::integer,
      item->'pick'->>'bet_kill_rule',
      nullif(item->'pick'->>'guardrail', ''),
      nullif(item->'pick'->>'grade', ''),
      nullif(item->'pick'->>'grade_score', '')::numeric,
      coalesce(item->'pick'->'signal_scores', '{}'::jsonb),
      wanted
    ) returning id into new_id;

    insert into public.pick_evidence (pick_id, signal, claim, source_url, source_label, position)
    select new_id, e.value->>'signal', e.value->>'claim',
           nullif(e.value->>'source_url', ''), nullif(e.value->>'source_label', ''), (e.ordinality - 1)::integer
    from jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) with ordinality as e(value, ordinality);

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb), s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;


-- ============================================================
-- 0024_signal_scoring.sql
-- ============================================================
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


-- ============================================================
-- 0025_script_direction.sql
-- ============================================================
-- Scripts carry direction (what to show, what to argue, what to prove), not
-- a shot list with lines to read. The hook stays the one verbatim line.
-- Run after 0024. Idempotent: pasted by hand, safe to re-run.

alter table public.pick_scripts
  add column if not exists direction jsonb;

-- replace_week_picks writes the direction alongside the (now optional) beats.
create or replace function public.replace_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
declare
  item jsonb;
  new_id uuid;
  wanted text;
begin
  delete from public.picks p
  where p.business_id = p_business_id
    and p.week_of = p_week_of
    and not exists (select 1 from public.pick_runs r where r.pick_id = p.id)
    and not exists (select 1 from public.pick_feedback f where f.pick_id = p.id);

  for item in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    wanted := coalesce(item->'pick'->>'status', 'draft');
    if jsonb_array_length(coalesce(item->'scripts', '[]'::jsonb)) < 3
       or jsonb_array_length(coalesce(item->'evidence', '[]'::jsonb)) < 1 then
      wanted := 'draft';
    end if;

    insert into public.picks (
      business_id, opportunity_id, week_of, rank, geo, term, finding,
      metric_label, metric_value, metric_delta_pct, metric_window, sparkline,
      bet_what, bet_budget_usd, bet_duration_days, bet_kill_rule, guardrail,
      grade, grade_score, signal_scores, status
    ) values (
      p_business_id,
      nullif(item->'pick'->>'opportunity_id', '')::uuid,
      p_week_of,
      (item->'pick'->>'rank')::integer,
      coalesce(item->'pick'->>'geo', 'US'),
      item->'pick'->>'term',
      item->'pick'->>'finding',
      item->'pick'->>'metric_label',
      nullif(item->'pick'->>'metric_value', '')::numeric,
      nullif(item->'pick'->>'metric_delta_pct', '')::numeric,
      item->'pick'->>'metric_window',
      coalesce(item->'pick'->'sparkline', '[]'::jsonb),
      item->'pick'->>'bet_what',
      (item->'pick'->>'bet_budget_usd')::numeric,
      (item->'pick'->>'bet_duration_days')::integer,
      item->'pick'->>'bet_kill_rule',
      nullif(item->'pick'->>'guardrail', ''),
      nullif(item->'pick'->>'grade', ''),
      nullif(item->'pick'->>'grade_score', '')::numeric,
      coalesce(item->'pick'->'signal_scores', '{}'::jsonb),
      wanted
    ) returning id into new_id;

    insert into public.pick_evidence (pick_id, signal, claim, source_url, source_label, position)
    select new_id, e.value->>'signal', e.value->>'claim',
           nullif(e.value->>'source_url', ''), nullif(e.value->>'source_label', ''), (e.ordinality - 1)::integer
    from jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) with ordinality as e(value, ordinality);

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, direction, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb), s.value->'direction', s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;


-- ============================================================
-- 0026_track_record.sql
-- ============================================================
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


-- ============================================================
-- 0027_comments_reviews_stock_usage.sql
-- ============================================================
-- The reads the four signals were promised and did not have: what customers
-- say under the brand's and its rivals' posts, what they say about the
-- rivals on Trustpilot, whether a product is in stock, and what every model
-- call costs. Run after 0026. Idempotent: pasted by hand, safe to re-run.

-- ---------------------------------------------------------- social comments
-- Comment text on a post the brand or a rival published. The Customer
-- signal's intent read needs what customers write, not what brands post;
-- "1 in 3 comments on your posts ask what the filter removes" is a claim
-- only this table can back.
create table if not exists public.social_comments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  competitor_id    uuid references public.competitors (id) on delete cascade,
  platform         text not null check (platform in ('instagram','tiktok','facebook')),
  post_external_id text not null,
  external_id      text not null,
  author           text not null default '',
  text             text not null,
  likes            integer not null default 0,
  posted_at        timestamptz,
  captured_at      timestamptz not null default now()
);
alter table public.social_comments enable row level security;
create unique index if not exists social_comments_identity_idx
  on public.social_comments (business_id, platform, external_id);
create index if not exists social_comments_business_post_idx
  on public.social_comments (business_id, post_external_id);
drop policy if exists "social_comments: via business" on public.social_comments;
create policy "social_comments: via business" on public.social_comments
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------------ reviews
-- Trustpilot for online brands and their rivals; a rival's own site when it
-- publishes reviews as structured data. Google stays the local read.
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews
  add constraint reviews_source_check
  check (source in ('google','seed','trustpilot','site'));

-- -------------------------------------------------------------------- stock
-- Read from the store's public catalog once a day. Null means never read,
-- never "in stock".
alter table public.services
  add column if not exists in_stock boolean;

-- ----------------------------------------------------------------- ai usage
-- Every model call's tokens, by brand and by the job that made it. The
-- product had no idea what a brand's week cost in model calls.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid references public.businesses (id) on delete cascade,
  purpose        text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_business_idx on public.ai_usage (business_id, created_at desc);
-- Written by the service role only; owners never read it from the app.
drop policy if exists "ai_usage: service only" on public.ai_usage;
create policy "ai_usage: service only" on public.ai_usage
  for all using (false) with check (false);


-- ============================================================
-- 0028_creative_tests.sql
-- ============================================================
-- The pick becomes a creative test: a concept the brand can hand to a
-- creator, not a keyword. The search term stays as the research input the
-- concept was found through. Evidence rows say what kind of observation they
-- are, when they were observed and on what sample. Decisions are separate
-- from launches, launches from results, and results from what was learned.
-- Onboarding asks for the context a brief needs (objective, formats, claims).
-- Provider calls are metered per brand. Run after 0027. Idempotent: pasted
-- by hand, safe to re-run. Nothing here rewrites an existing row: a pick
-- written before this migration keeps reading as a keyword pick.

-- --------------------------------------------------------------- picks
alter table public.picks
  add column if not exists concept_title text,
  add column if not exists brief jsonb,
  add column if not exists brief_version text,
  add column if not exists basis text,
  add column if not exists priority_reason text;
alter table public.picks drop constraint if exists picks_basis_check;
alter table public.picks drop constraint if exists picks_basis_check;
alter table public.picks
  add constraint picks_basis_check check (basis is null or basis in ('builds_on','explores'));

-- ------------------------------------------------------------ evidence
-- kind: observation (something seen on a date), quote (a customer's or a
-- rival's own words), measurement (a number with a sample behind it),
-- context (category background). limitation: what the row cannot say.
alter table public.pick_evidence
  add column if not exists kind text not null default 'observation',
  add column if not exists observed_on date,
  add column if not exists sample_size integer,
  add column if not exists limitation text;
alter table public.pick_evidence drop constraint if exists pick_evidence_kind_check;
alter table public.pick_evidence drop constraint if exists pick_evidence_kind_check;
alter table public.pick_evidence
  add constraint pick_evidence_kind_check check (kind in ('observation','quote','measurement','context'));

-- ------------------------------------------------------------ decisions
-- chosen: picked for production (not launched). refined: rewritten on the
-- owner's direction. running and dismissed keep their meaning.
alter table public.pick_feedback drop constraint if exists pick_feedback_action_check;
alter table public.pick_feedback drop constraint if exists pick_feedback_action_check;
alter table public.pick_feedback
  add constraint pick_feedback_action_check check (action in ('running','dismissed','chosen','refined'));
alter table public.pick_feedback drop constraint if exists pick_feedback_reason_check;
alter table public.pick_feedback drop constraint if exists pick_feedback_reason_check;
alter table public.pick_feedback
  add constraint pick_feedback_reason_check
  check (reason is null or reason in ('wrong_customer','already_tried','off_brand','cant_shoot','not_now','other'));

-- ---------------------------------------------------------------- runs
-- planned: chosen for production, nothing live yet. running: launched.
-- completed / killed: ended, with or without numbers. learned: the owner's
-- own sentence on what the test taught, kept apart from the numbers.
alter table public.pick_runs drop constraint if exists pick_runs_status_check;
alter table public.pick_runs drop constraint if exists pick_runs_status_check;
alter table public.pick_runs
  add constraint pick_runs_status_check check (status in ('planned','running','completed','killed'));
alter table public.pick_runs
  add column if not exists launched_at timestamptz,
  add column if not exists learned text;

-- ---------------------------------------------------------- businesses
-- What a brief needs that the website cannot say.
alter table public.businesses
  add column if not exists campaign_objective text,
  add column if not exists production_formats text[] not null default '{}'::text[],
  add column if not exists claims_notes text,
  add column if not exists recent_creative_notes text,
  add column if not exists priority_service_id uuid references public.services (id) on delete set null;
alter table public.businesses drop constraint if exists businesses_campaign_objective_check;
alter table public.businesses drop constraint if exists businesses_campaign_objective_check;
alter table public.businesses
  add constraint businesses_campaign_objective_check
  check (campaign_objective is null or campaign_objective in ('purchases','leads','traffic','awareness'));

-- ------------------------------------------------------ provider usage
-- Every paid call outside the model: which provider, how many units, and
-- what that is estimated to cost, by brand and by the job that made it.
-- basis says whether the cents are an estimate from a public rate or a
-- billed figure; the product has no billed figures yet.
create table if not exists public.provider_usage (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references public.businesses (id) on delete cascade,
  provider        text not null,
  operation       text not null,
  units           numeric not null default 0,
  unit_label      text not null default 'calls',
  est_cost_cents  numeric,
  basis           text not null default 'estimate' check (basis in ('estimate','billed')),
  purpose         text not null default 'unknown',
  ok              boolean not null default true,
  note            text,
  created_at      timestamptz not null default now()
);
alter table public.provider_usage enable row level security;
create index if not exists provider_usage_created_idx on public.provider_usage (created_at desc);
create index if not exists provider_usage_business_idx on public.provider_usage (business_id, created_at desc);
drop policy if exists "provider_usage: service only" on public.provider_usage;
create policy "provider_usage: service only" on public.provider_usage
  for all using (false) with check (false);

-- ---------------------------------------------------- pilot applications
-- The founder-assisted pilot's front door. Separate from demo_requests so
-- the old form's rows keep their shape.
create table if not exists public.pilot_applications (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text not null,
  brand_name         text not null,
  website            text,
  monthly_spend      text,
  objective          text,
  runs_meta_ads      boolean,
  production         text,
  what_next          text,
  status             text not null default 'new' check (status in ('new','contacted','accepted','declined')),
  created_at         timestamptz not null default now()
);
alter table public.pilot_applications enable row level security;
create index if not exists pilot_applications_created_idx on public.pilot_applications (created_at desc);
-- Anyone may apply; nobody reads applications from the app (service role only).
drop policy if exists "pilot_applications: insert only" on public.pilot_applications;
create policy "pilot_applications: insert only" on public.pilot_applications
  for insert with check (true);
drop policy if exists "pilot_applications: no read" on public.pilot_applications;
create policy "pilot_applications: no read" on public.pilot_applications
  for select using (false);

-- --------------------------------------------- one week, one transaction
-- replace_week_picks now writes the concept alongside the keyword columns,
-- and the evidence rows' provenance. The ready gate: a pick with a brief
-- needs one evidence row; a pick without one (the older shape) still needs
-- three scripts and one evidence row.
create or replace function public.replace_week_picks(p_business_id uuid, p_week_of date, p_picks jsonb)
returns setof uuid
language plpgsql
as $$
declare
  item jsonb;
  new_id uuid;
  wanted text;
begin
  delete from public.picks p
  where p.business_id = p_business_id
    and p.week_of = p_week_of
    and not exists (select 1 from public.pick_runs r where r.pick_id = p.id)
    and not exists (select 1 from public.pick_feedback f where f.pick_id = p.id);

  for item in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) loop
    wanted := coalesce(item->'pick'->>'status', 'draft');
    if jsonb_array_length(coalesce(item->'evidence', '[]'::jsonb)) < 1 then
      wanted := 'draft';
    elsif (item->'pick'->'brief') is null or jsonb_typeof(item->'pick'->'brief') <> 'object' then
      if jsonb_array_length(coalesce(item->'scripts', '[]'::jsonb)) < 3 then
        wanted := 'draft';
      end if;
    end if;

    insert into public.picks (
      business_id, opportunity_id, week_of, rank, geo, term, finding,
      metric_label, metric_value, metric_delta_pct, metric_window, sparkline,
      bet_what, bet_budget_usd, bet_duration_days, bet_kill_rule, guardrail,
      grade, grade_score, signal_scores, status,
      concept_title, brief, brief_version, basis, priority_reason
    ) values (
      p_business_id,
      nullif(item->'pick'->>'opportunity_id', '')::uuid,
      p_week_of,
      (item->'pick'->>'rank')::integer,
      coalesce(item->'pick'->>'geo', 'US'),
      item->'pick'->>'term',
      item->'pick'->>'finding',
      item->'pick'->>'metric_label',
      nullif(item->'pick'->>'metric_value', '')::numeric,
      nullif(item->'pick'->>'metric_delta_pct', '')::numeric,
      item->'pick'->>'metric_window',
      coalesce(item->'pick'->'sparkline', '[]'::jsonb),
      item->'pick'->>'bet_what',
      (item->'pick'->>'bet_budget_usd')::numeric,
      (item->'pick'->>'bet_duration_days')::integer,
      item->'pick'->>'bet_kill_rule',
      nullif(item->'pick'->>'guardrail', ''),
      nullif(item->'pick'->>'grade', ''),
      nullif(item->'pick'->>'grade_score', '')::numeric,
      coalesce(item->'pick'->'signal_scores', '{}'::jsonb),
      wanted,
      nullif(item->'pick'->>'concept_title', ''),
      case when jsonb_typeof(item->'pick'->'brief') = 'object' then item->'pick'->'brief' else null end,
      nullif(item->'pick'->>'brief_version', ''),
      nullif(item->'pick'->>'basis', ''),
      nullif(item->'pick'->>'priority_reason', '')
    ) returning id into new_id;

    insert into public.pick_evidence (pick_id, signal, claim, source_url, source_label, position, kind, observed_on, sample_size, limitation)
    select new_id, e.value->>'signal', e.value->>'claim',
           nullif(e.value->>'source_url', ''), nullif(e.value->>'source_label', ''), (e.ordinality - 1)::integer,
           coalesce(nullif(e.value->>'kind', ''), 'observation'),
           nullif(e.value->>'observed_on', '')::date,
           nullif(e.value->>'sample_size', '')::integer,
           nullif(e.value->>'limitation', '')
    from jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) with ordinality as e(value, ordinality);

    insert into public.pick_scripts (pick_id, position, variant_label, thesis, hook, beats, direction, cta, duration_seconds)
    select new_id, (s.ordinality - 1)::integer, s.value->>'variant_label', s.value->>'thesis', s.value->>'hook',
           coalesce(s.value->'beats', '[]'::jsonb),
           case when jsonb_typeof(s.value->'direction') = 'object' then s.value->'direction' else null end,
           s.value->>'cta', (s.value->>'duration_seconds')::integer
    from jsonb_array_elements(coalesce(item->'scripts', '[]'::jsonb)) with ordinality as s(value, ordinality);

    return next new_id;
  end loop;
end;
$$;


-- ============================================================
-- 0029_calibration.sql
-- ============================================================
-- The calibration log: every finished run keeps the account click-through it
-- was judged against and its lift over it, so "A picks win more than B
-- picks" is checked against results rather than asserted. Run after 0028.
-- Idempotent: pasted by hand, safe to re-run.

-- baseline_ctr: the brand's impression-weighted click-through across its ad
-- history when the run ended, with the run's own row left out. Frozen on
-- the run so the comparison never drifts as the account's history grows.
-- lift: the run's click-through over baseline_ctr; 1.3 means 30% above.
alter table public.pick_runs
  add column if not exists baseline_ctr numeric,
  add column if not exists lift numeric;


-- ============================================================
-- 0030_campaign_objectives.sql
-- ============================================================
-- A brand may run more than one campaign type at once (purchases and leads,
-- say), so the objective becomes a list. The single value 0028 added is
-- carried over, then its column goes. Run after 0029.
-- Idempotent: pasted by hand, safe to re-run.

alter table public.businesses
  add column if not exists campaign_objectives text[] not null default '{}'::text[];

update public.businesses
  set campaign_objectives = array[campaign_objective]
  where campaign_objective is not null and campaign_objectives = '{}'::text[];

alter table public.businesses drop constraint if exists businesses_campaign_objective_check;
alter table public.businesses drop column if exists campaign_objective;

alter table public.businesses drop constraint if exists businesses_campaign_objectives_check;
alter table public.businesses drop constraint if exists businesses_campaign_objectives_check;
alter table public.businesses
  add constraint businesses_campaign_objectives_check
  check (campaign_objectives <@ array['purchases','leads','traffic','awareness']::text[]);


-- ============================================================
-- 0031_strategy_reads.sql
-- ============================================================
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


-- ============================================================
-- 0032_ad_depth.sql
-- ============================================================
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
alter table public.ad_history drop constraint if exists ad_history_creative_kind_check;
alter table public.ad_history
  add constraint ad_history_creative_kind_check check (creative_kind is null or creative_kind in ('video','image','carousel'));
create index if not exists ad_history_external_idx on public.ad_history (business_id, external_ad_id);
create index if not exists ad_history_run_idx on public.ad_history (run_id);


-- ============================================================
-- 0033_creative_record.sql
-- ============================================================
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
alter table public.ad_history drop constraint if exists ad_history_angle_check;
alter table public.ad_history
  add constraint ad_history_angle_check check (angle is null or angle in ('education','offer','scarcity','social_proof','speed','novelty'));
alter table public.ad_history drop constraint if exists ad_history_hook_type_check;
alter table public.ad_history drop constraint if exists ad_history_hook_type_check;
alter table public.ad_history
  add constraint ad_history_hook_type_check check (hook_type is null or hook_type in ('question','problem','claim','story','comparison','callout','demonstration','offer','other'));
alter table public.ad_history drop constraint if exists ad_history_format_check;
alter table public.ad_history drop constraint if exists ad_history_format_check;
alter table public.ad_history
  add constraint ad_history_format_check check (format is null or format in ('talking_head','ugc','demo','static','editor','studio','carousel','video','unknown'));

-- fidelity_score: the share of the brief's checks the finished ad passed,
-- 0 to 1. fidelity_read: the checks themselves and where the words came from.
alter table public.pick_runs
  add column if not exists fidelity_score numeric,
  add column if not exists fidelity_read jsonb;


-- ============================================================
-- 0034_team_and_share.sql
-- ============================================================
-- A brand is a team, and a brief leaves the building. business_members
-- lets an owner invite the media buyer, the strategist and the creator by
-- email; a member sees the brand's data through the same row security the
-- owner does (owns_business now includes members), while the business row
-- itself stays the owner's to edit. A pick can carry a share token: the
-- brief at /share/<token> reads without an account, for the creator who
-- will never log in. Run after 0033. Idempotent: pasted by hand, safe to
-- re-run.

-- ------------------------------------------------------------ members
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  email        text not null,
  user_id      uuid references public.profiles (id) on delete set null,
  role         text not null default 'member' check (role in ('member')),
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (business_id, email)
);
alter table public.business_members enable row level security;
create index if not exists business_members_email_idx on public.business_members (lower(email));
create index if not exists business_members_user_idx on public.business_members (user_id);

-- The signed-in user's email, as the JWT carries it.
create or replace function public.session_email()
returns text
language sql
stable
as $$
  select lower(coalesce((select auth.jwt() ->> 'email'), ''));
$$;

-- A member is a row for this user, or for this user's email before the
-- first sign-in claimed it.
create or replace function public.is_member(b_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = b_id
      and (m.user_id = (select auth.uid()) or lower(m.email) = public.session_email())
  );
$$;

-- Every "via business" policy in the schema calls this: members now pass.
create or replace function public.owns_business(b_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = b_id and b.owner_id = (select auth.uid())
  ) or public.is_member(b_id);
$$;

-- Members read the business row; only the owner writes it.
drop policy if exists "businesses: member read" on public.businesses;
create policy "businesses: member read" on public.businesses
  for select using (public.is_member(id));

-- The owner manages the roster; a member sees the roster and claims their own row.
drop policy if exists "business_members: owner all" on public.business_members;
create policy "business_members: owner all" on public.business_members
  for all using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "business_members: member read" on public.business_members;
create policy "business_members: member read" on public.business_members
  for select using (public.is_member(business_id));
drop policy if exists "business_members: claim own" on public.business_members;
create policy "business_members: claim own" on public.business_members
  for update using (lower(email) = public.session_email())
  with check (lower(email) = public.session_email());

-- -------------------------------------------------------------- share
alter table public.picks add column if not exists share_token text;
create unique index if not exists picks_share_token_idx on public.picks (share_token) where share_token is not null;


-- ============================================================
-- 0035_plans.sql
-- ============================================================
-- Three plans on access, metered on briefs a week, rivals tracked and
-- seats: starter, baseline (the pilot tier) and pro. Run after 0034.
-- Idempotent: pasted by hand, safe to re-run.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('trial', 'starter', 'baseline', 'pro'));


-- ============================================================
-- 0036_prospect_reads.sql
-- ============================================================
-- The free account read: a prospect's brand, read the way a customer's is
-- (site, catalog, founding analysis, rivals, the strategist pass) into a
-- shadow business the founder owns, so the teardown email can quote it.
-- A prospect business never gets a week, an email or a cron read. Run
-- after 0035. Idempotent: pasted by hand, safe to re-run.
alter table public.businesses add column if not exists prospect boolean not null default false;
create index if not exists businesses_prospect_idx on public.businesses (prospect) where prospect;


-- ============================================================
-- 0037_shopify.sql
-- ============================================================
-- The brand's own store, read from Shopify with a custom-app Admin API
-- token: products with their cost (so a brief knows what an offer can
-- afford), variants, stock, the last 30 days of orders split new against
-- returning, and the discount codes that are live. Run after 0036.
-- Idempotent: pasted by hand, safe to re-run.

alter table public.connections drop constraint if exists connections_provider_check;
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


-- ============================================================
-- 0038_test_watches.sql
-- ============================================================
-- 0038 — test watches: the free read's loop.
--
-- A visitor who ran the free category read can leave an email; TRND then
-- looks for their version of the brief in the public Ad Library every day
-- and emails when it goes live, when it passes three weeks, and when it
-- stops, against the rival ad it was modeled on. No account is involved,
-- so the table is service role only: nothing in the app reads it as a user.

create table if not exists public.test_watches (
  id               uuid primary key default gen_random_uuid(),
  token            text not null unique,
  email            text not null,
  website          text not null,
  domain           text not null,
  brand_name       text not null,
  title            text not null,
  hook             text not null,
  on_screen        text,
  rival            jsonb,
  status           text not null default 'pending'
                     check (status in ('pending','watching','live','ended','expired','stopped')),
  matched_ad       jsonb,
  stages_sent      text[] not null default '{}',
  confirmed_at     timestamptz,
  live_at          timestamptz,
  ended_at         timestamptz,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.test_watches enable row level security;
create index if not exists test_watches_status_idx on public.test_watches (status);
create index if not exists test_watches_email_idx on public.test_watches (lower(email));

-- The email is stored lower-cased so the per-address cap reads one value.
create or replace function public.test_watches_lower_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(new.email);
  return new;
end $$;
drop trigger if exists test_watches_lower_email on public.test_watches;
create trigger test_watches_lower_email before insert or update of email on public.test_watches
  for each row execute function public.test_watches_lower_email();

-- No policies: RLS on with none means no anon or user access at all. The
-- routes and the daily cron use the service role.


-- ============================================================
-- 0039_own_ad_reads.sql
-- ============================================================
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

