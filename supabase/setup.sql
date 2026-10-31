-- TRND for Creators: everything in one paste for the Supabase SQL editor of a
-- fresh project. Safe to re-run.
--
-- A creator (one per owner) is a TikTok handle. Each scan reads their recent
-- videos, the videos of a handful of peer creators in the same niche and the
-- niche's hashtags, snapshots the numbers, and writes a plan: three ideas to
-- post next. An idea the creator adds to their week is matched to the video
-- they post, and its numbers are checked 48 hours later.

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  display_name text,
  avatar_url text,
  bio text,
  followers bigint,
  following bigint,
  hearts bigint,
  videos int,
  -- The model's read of the account: niche, audience, what works and what doesn't.
  profile jsonb,
  -- What the creator is posting for, set by them: goal, posts per week, target, notes.
  goals jsonb,
  -- Niche hashtags to watch, and where each came from.
  hashtags text[] not null default '{}',
  plan text not null default 'trial',
  plan_status text not null default 'active',
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  scan_status text not null default 'idle', -- idle | running | error
  scan_stage text, -- profile | niche | peers | trends | tag | plan, while running
  scan_error text,
  scan_started_at timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id)
);

-- Creators in the same niche, matched by the scan or added by the owner.
create table if not exists public.peers (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  handle text not null,
  display_name text,
  avatar_url text,
  followers bigint,
  reason text,
  source text not null default 'match', -- match | owner
  last_read_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (creator_id, handle)
);

-- Every video read, the creator's own and their peers', latest numbers on the row.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  author text not null, -- the handle that posted it
  is_self boolean not null default false,
  video_id text not null,
  url text,
  caption text,
  hashtags text[] not null default '{}',
  sound text,
  sound_original boolean,
  duration_s int,
  cover_url text,
  posted_at timestamptz,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  -- The model's read: the format (e.g. "ranked list") and the opening line.
  format text,
  hook text,
  first_seen_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  unique (creator_id, video_id)
);
create index if not exists videos_creator_idx on public.videos (creator_id, is_self, posted_at desc);

-- One row per video per day it was read: what "48 hours later" is measured from.
create table if not exists public.video_snapshots (
  video_id uuid not null references public.videos(id) on delete cascade,
  captured_on date not null,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  primary key (video_id, captured_on)
);

-- Follower counts per day, the creator's and each peer's.
create table if not exists public.follower_snapshots (
  creator_id uuid not null references public.creators(id) on delete cascade,
  handle text not null,
  followers bigint not null,
  captured_on date not null,
  primary key (creator_id, handle, captured_on)
);

-- What each scan saw for each hashtag and sound in the niche: the basis for early, rising, peaking, fading.
create table if not exists public.trend_snapshots (
  creator_id uuid not null references public.creators(id) on delete cascade,
  kind text not null, -- hashtag | sound
  key text not null,
  label text not null,
  -- Videos in the sample using it, posted in the last 7 days and the 7 before; their views.
  recent int not null default 0,
  prior int not null default 0,
  views bigint not null default 0,
  -- Hashtag-wide totals when the source reports them.
  total_views bigint,
  captured_on date not null,
  primary key (creator_id, kind, key, captured_on)
);

-- What a scan ends with: the answer and the ideas.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists plans_creator_idx on public.plans (creator_id, created_at desc);

-- An idea the creator put in their week, the video it became, and how it did.
create table if not exists public.idea_runs (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  rank int not null,
  idea jsonb not null,
  -- The creator's own typical range when it was added: { low, high } views.
  expected jsonb,
  video_id uuid references public.videos(id) on delete set null,
  status text not null default 'planned', -- planned | posted | checked
  result jsonb,
  added_at timestamptz not null default now(),
  matched_at timestamptz,
  checked_at timestamptz
);
create index if not exists idea_runs_creator_idx on public.idea_runs (creator_id, added_at desc);
-- One run per idea: a double click on "Add to my week" cannot add it twice.
create unique index if not exists idea_runs_plan_rank_idx on public.idea_runs (plan_id, rank);

-- Row-level security: owners read their own rows; every write goes through the service role.
alter table public.creators enable row level security;
alter table public.peers enable row level security;
alter table public.videos enable row level security;
alter table public.video_snapshots enable row level security;
alter table public.follower_snapshots enable row level security;
alter table public.trend_snapshots enable row level security;
alter table public.plans enable row level security;
alter table public.idea_runs enable row level security;

drop policy if exists creators_owner_read on public.creators;
create policy creators_owner_read on public.creators for select using (owner_id = auth.uid());

drop policy if exists peers_owner_read on public.peers;
create policy peers_owner_read on public.peers for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

drop policy if exists videos_owner_read on public.videos;
create policy videos_owner_read on public.videos for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

drop policy if exists video_snapshots_owner_read on public.video_snapshots;
create policy video_snapshots_owner_read on public.video_snapshots for select
  using (exists (select 1 from public.videos v join public.creators c on c.id = v.creator_id where v.id = video_snapshots.video_id and c.owner_id = auth.uid()));

drop policy if exists follower_snapshots_owner_read on public.follower_snapshots;
create policy follower_snapshots_owner_read on public.follower_snapshots for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

drop policy if exists trend_snapshots_owner_read on public.trend_snapshots;
create policy trend_snapshots_owner_read on public.trend_snapshots for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

drop policy if exists plans_owner_read on public.plans;
create policy plans_owner_read on public.plans for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

drop policy if exists idea_runs_owner_read on public.idea_runs;
create policy idea_runs_owner_read on public.idea_runs for select
  using (exists (select 1 from public.creators c where c.id = creator_id and c.owner_id = auth.uid()));

-- A creator's connected TikTok account (Login Kit). Tokens are read only by the
-- service role: there is no owner read policy on this table.
create table if not exists public.tiktok_connections (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  open_id text not null,
  username text,
  scopes text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_at timestamptz not null default now()
);
alter table public.tiktok_connections enable row level security;
alter table public.creators add column if not exists tiktok_connected_at timestamptz;
-- "Read again now": the next plan stage writes a new plan even inside the week.
alter table public.creators add column if not exists plan_requested boolean not null default false;
-- When the model last read the account (niche, audience, hashtags): weekly, apart from the daily reads.
alter table public.creators add column if not exists profile_read_at timestamptz;
-- A matched peer the owner removed stays here, hidden, so the next scan doesn't match them again.
alter table public.peers add column if not exists removed_at timestamptz;

-- The free preview: what a visitor sees for a handle before they have an account.
-- Read and written only by the server (service role): no owner policies. One
-- preview per handle is reused for 72 hours, so a popular handle costs one read.
create table if not exists public.previews (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  -- confirm (read, waiting for "that's me") | niche | idea | ready | ineligible | error
  status text not null default 'reading',
  step_started_at timestamptz,
  author jsonb,
  videos jsonb not null default '[]',
  profile jsonb,
  hashtags text[] not null default '{}',
  peers jsonb not null default '[]',
  sample jsonb not null default '[]',
  trends jsonb not null default '[]',
  plan jsonb,
  goal text,
  reason text,
  claimed_by uuid references public.creators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists previews_handle_idx on public.previews (handle, created_at desc);
alter table public.previews enable row level security;

-- Previews started per visitor (a hash of their IP) and in all per day: the abuse and spend limits.
create table if not exists public.preview_hits (
  key text not null,
  day date not null,
  count int not null default 0,
  primary key (key, day)
);
alter table public.preview_hits enable row level security;

-- A creator's own answers from onboarding, and their trial.
alter table public.creators add column if not exists on_camera text; -- face | voice | either
alter table public.creators add column if not exists trial_used_at timestamptz;

-- Security review: atomic preview caps and no browser-role grants on server-only tables.
-- The free preview's caps, taken in one transaction: concurrent starts can no
-- longer all read "under the cap" before any of them counts. Locks the day's
-- "all" row, then the visitor's, so two calls never wait on each other in a cycle.
create or replace function public.take_preview_slot(p_visitor text, p_day date, p_per_visitor int, p_budget int)
returns text
language plpgsql
set search_path = public
as $$
declare
  v int;
  a int;
begin
  insert into public.preview_hits (key, day, count) values ('all', p_day, 0), (p_visitor, p_day, 0) on conflict do nothing;
  select count into a from public.preview_hits where key = 'all' and day = p_day for update;
  select count into v from public.preview_hits where key = p_visitor and day = p_day for update;
  if a >= p_budget then return 'budget'; end if;
  if v >= p_per_visitor then return 'visitor'; end if;
  update public.preview_hits set count = count + 1 where day = p_day and key in ('all', p_visitor);
  return 'ok';
end;
$$;
-- Server only: a visitor calling it through the public API could spend everyone's daily budget.
revoke all on function public.take_preview_slot(text, date, int, int) from public, anon, authenticated;
grant execute on function public.take_preview_slot(text, date, int, int) to service_role;

-- Defense in depth: the tables only the server reads or writes carry no grants
-- for the browser's roles at all, so a policy added by mistake can't open them.
revoke all on public.tiktok_connections, public.previews, public.preview_hits from anon, authenticated;
-- Every write goes through the service role; signed-in users and visitors only read, under RLS.
revoke insert, update, delete, truncate, references, trigger on
  public.creators, public.peers, public.videos, public.video_snapshots, public.follower_snapshots,
  public.trend_snapshots, public.plans, public.idea_runs
  from anon, authenticated;

-- Video covers: TikTok's image links expire, so the free preview keeps its own
-- small JPEG of each of the creator's videos (lib/preview/covers.ts), by video
-- id. A public bucket: anyone can read a cover by its URL; only the server
-- (service role) writes. The stored URL is saved on each video in
-- previews.videos (jsonb), so no column is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 524288, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;


-- The weekly plan email can be turned off, from Settings or the link in the email itself.
alter table public.creators add column if not exists email_plans boolean not null default true;
-- The trial end the reminder was sent for: Stripe redelivers events, and a second copy sends nothing.
alter table public.creators add column if not exists trial_reminder_for timestamptz;
-- Failed reads in a row: the daily read backs off an account that keeps failing (a deleted or private handle).
alter table public.creators add column if not exists scan_failures int not null default 0;
