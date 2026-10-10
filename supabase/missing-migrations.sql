-- TRND: the migrations missing from the live database (0027, 0031, 0035, 0038, 0039), re-runnable.
-- Everything before 0027 and the rest through 0037 are already applied there. Paste into the SQL editor, run once.

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

