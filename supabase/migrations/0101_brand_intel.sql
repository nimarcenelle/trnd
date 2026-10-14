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
