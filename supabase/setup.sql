-- TRND database setup: everything in one paste for the Supabase SQL editor.
-- This is 0100_surveillance.sql followed by 0101_brand_intel.sql. Safe to re-run.

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


-- Brand intelligence, objectives, past ad results and organic social. Safe to re-run.
--
-- The brand itself is now watched like a rival: one rivals row per brand with
-- is_self = true, so its own Meta ads go through the same scan, diff and tags.
-- brands.profile holds what the brand sells, to whom and how (editable by the
-- owner). Instagram and TikTok presence for the brand and every rival lives in
-- social_profiles, with a daily follower snapshot for growth.

alter table public.brands add column if not exists profile jsonb;

alter table public.rivals add column if not exists is_self boolean not null default false;
alter table public.rivals add column if not exists instagram text;
alter table public.rivals add column if not exists tiktok text;
-- When the rival's website was last read for social links, so it is read once.
alter table public.rivals add column if not exists socials_checked_at timestamptz;
create unique index if not exists rivals_one_self_idx on public.rivals (brand_id) where is_self;

create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  platform text not null, -- instagram | tiktok
  handle text not null,
  display_name text,
  followers int,
  following int,
  posts int,
  -- Recent posts: { url, caption, posted_at, likes, comments, views, kind }.
  recent jsonb not null default '[]',
  posts_per_week numeric,
  engagement_rate numeric, -- mean (likes + comments) / followers over recent posts
  fetched_at timestamptz,
  error text,
  unique (rival_id, platform)
);
create index if not exists social_profiles_brand_idx on public.social_profiles (brand_id);

create table if not exists public.social_snapshots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.social_profiles(id) on delete cascade,
  followers int not null,
  captured_on date not null default current_date,
  unique (profile_id, captured_on)
);

alter table public.social_profiles enable row level security;
alter table public.social_snapshots enable row level security;

drop policy if exists social_profiles_owner_read on public.social_profiles;
create policy social_profiles_owner_read on public.social_profiles for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

drop policy if exists social_snapshots_owner_read on public.social_snapshots;
create policy social_snapshots_owner_read on public.social_snapshots for select
  using (exists (
    select 1 from public.social_profiles p join public.brands b on b.id = p.brand_id
    where p.id = profile_id and b.owner_id = auth.uid()
  ));

-- What the brand is trying to do right now (goal, budget, target cost), set by the owner.
alter table public.brands add column if not exists objectives jsonb;

-- The brand's own ad results, from an Ads Manager export the owner uploads.
-- Each upload replaces the previous one.
create table if not exists public.own_ad_results (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  ad_name text not null,
  body text,
  spend numeric,
  impressions numeric,
  clicks numeric,
  ctr numeric, -- percent, as Ads Manager reports it
  results numeric,
  result_type text,
  cost_per_result numeric,
  roas numeric,
  period_start date,
  period_end date,
  uploaded_at timestamptz not null default now()
);
create index if not exists own_ad_results_brand_idx on public.own_ad_results (brand_id);
alter table public.own_ad_results enable row level security;
drop policy if exists own_ad_results_owner_read on public.own_ad_results;
create policy own_ad_results_owner_read on public.own_ad_results for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

-- 0102_page_source.sql
-- How a rival's Facebook Page was settled: 'checked' (found and confirmed
-- against its ads) or 'owner' (pasted by the owner). Null means matched before
-- this column existed, so the next scan checks it once. Safe to re-run.
alter table public.rivals add column if not exists page_source text;

-- 0103_signals.sql
-- Two more signal streams beside Meta ads: competitors' websites and their
-- marketing emails. Safe to re-run.
--
-- Websites: each scan snapshots a rival's homepage and product catalog
-- (site_snapshots, latest kept) and records what materially changed since the
-- last one (site_changes): products added or dropped, prices, sales, promos,
-- headline messaging.
--
-- Emails: every rival gets its own inbound address (rivals.inbox_token). TRND
-- signs it up to the rival's newsletter, or the owner does; whatever arrives is
-- stored in emails and tagged by the model.

alter table public.rivals add column if not exists inbox_token text;
create unique index if not exists rivals_inbox_token_idx on public.rivals (inbox_token);
-- null: not tried yet | subscribed: the signup form took it | manual: the owner must sign it up | receiving: mail arrives
alter table public.rivals add column if not exists email_status text;
alter table public.rivals add column if not exists email_note text;
alter table public.rivals add column if not exists site_checked_at timestamptz;

create table if not exists public.site_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  url text not null,
  -- { title, description, headlines[], promos[], nav[], products[{ id, title, price, compare_at, available, url }], text_hash }
  data jsonb not null,
  captured_at timestamptz not null default now()
);
create index if not exists site_snapshots_rival_idx on public.site_snapshots (rival_id, captured_at desc);

create table if not exists public.site_changes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  -- new_product | dropped_product | price_up | price_down | sale_started | sale_ended | promo_added | promo_removed | message_changed
  kind text not null,
  title text not null,
  before text,
  after text,
  url text,
  detected_at timestamptz not null default now()
);
create index if not exists site_changes_brand_idx on public.site_changes (brand_id, detected_at desc);

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  message_id text,
  from_address text,
  from_name text,
  subject text not null default '',
  preview text,
  body text,
  links jsonb not null default '[]',
  received_at timestamptz not null default now(),
  -- Set by the model: promo | launch | newsletter | content | retention | announcement | confirmation | other
  kind text,
  offer text,
  theme text,
  is_repeat boolean,
  unique (rival_id, message_id)
);
create index if not exists emails_brand_idx on public.emails (brand_id, received_at desc);

alter table public.site_snapshots enable row level security;
alter table public.site_changes enable row level security;
alter table public.emails enable row level security;

drop policy if exists site_snapshots_owner_read on public.site_snapshots;
create policy site_snapshots_owner_read on public.site_snapshots for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
drop policy if exists site_changes_owner_read on public.site_changes;
create policy site_changes_owner_read on public.site_changes for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
drop policy if exists emails_owner_read on public.emails;
create policy emails_owner_read on public.emails for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));

-- 0104_ad_scores.sql
-- A conversion score per ad: a heuristic for how well an ad has worked for the
-- company running it, from how long it has run, its reach rank, how many
-- versions it has, and (when the ad also runs as an organic post) that post's
-- engagement and comment sentiment. Safe to re-run.

-- Position in the Page's ads sorted by impressions on the last read (0 = most), and how many were read.
alter table public.ads add column if not exists impression_rank int;
alter table public.ads add column if not exists rank_total int;
-- What the ad is about, in a few words ("hard water", "hair breakage").
alter table public.ads add column if not exists topic text;
-- The organic post the ad matches, with its numbers: { platform, url, likes, comments, shares, views, sentiment, baseline }.
alter table public.ads add column if not exists engagement jsonb;
-- 0-100, and the parts it was blended from.
alter table public.ads add column if not exists score int;
alter table public.ads add column if not exists score_parts jsonb;
create index if not exists ads_score_idx on public.ads (brand_id, score desc);
