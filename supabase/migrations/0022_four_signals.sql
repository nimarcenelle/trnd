-- The four signal types the recommendation is built from — customer,
-- competitive, cultural, brand — need places to keep what they read.
--
-- Brand + competitive: social handles on the business and on each rival,
-- and the posts read from those accounts. Brand: the owner's own past ads
-- and how they did (an Ads Manager export, a synced account, or a hand
-- entry). Customer: the one target customer the brief names, with the words
-- they use — signal terms are judged against that vocabulary.

alter table public.businesses
  add column social_handles jsonb not null default '{}'::jsonb;

alter table public.competitors
  add column social_handles jsonb not null default '{}'::jsonb,
  add column directness numeric,
  add column directness_reason text;

alter table public.business_briefs
  add column target_customer jsonb not null default '{}'::jsonb;

-- Social and Google-ads reads join the dated observations on a rival.
alter table public.competitor_reads drop constraint competitor_reads_kind_check;
alter table public.competitor_reads
  add constraint competitor_reads_kind_check
  check (kind in ('ads','reviews','site','social','google_ads'));

-- ------------------------------------------------------------ social_posts
create table public.social_posts (
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
create unique index social_posts_identity_idx
  on public.social_posts (business_id, coalesce(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), platform, external_id);
create index social_posts_business_idx on public.social_posts (business_id, posted_at desc);
create policy "social_posts: via business" on public.social_posts
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- -------------------------------------------------------------- ad_history
create table public.ad_history (
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
create index ad_history_business_idx on public.ad_history (business_id, started_on desc);
create policy "ad_history: via business" on public.ad_history
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
