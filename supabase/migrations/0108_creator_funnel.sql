-- The creator funnel (/creators): what visitors do, who asked for a weekly
-- re-check, and the teardowns made as content. Written only by the service
-- role; RLS is on with no policies, so no signed-in user can read them.
-- Safe to re-run.

-- One row per thing a visitor did: check, check_failed, upgrade_click, lead, teardown.
create table if not exists public.creator_events (
  id bigint generated always as identity primary key,
  kind text not null,
  handle text,
  platform text,
  -- Where the visitor came from: the ?src= on the link (a teardown's code, "bio", ...).
  src text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists creator_events_time_idx on public.creator_events (created_at desc);
alter table public.creator_events enable row level security;

-- A creator who asked for their posts to be checked again every week.
create table if not exists public.creator_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  handle text not null,
  platform text not null,
  niche text,
  src text,
  -- In the unsubscribe link, so no login is needed to stop the email.
  token uuid not null default gen_random_uuid(),
  next_check_at timestamptz not null default now() + interval '7 days',
  last_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email, platform, handle)
);
create index if not exists creator_leads_due_idx on public.creator_leads (next_check_at) where unsubscribed_at is null;
alter table public.creator_leads enable row level security;

-- A teardown made in the studio: the check on a public creator and the script written from it.
create table if not exists public.creator_teardowns (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  platform text not null,
  niche text,
  -- The code put on this video's link (?src=), so checks it drives are counted to it.
  src text not null,
  stats jsonb not null,
  script jsonb not null,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists creator_teardowns_time_idx on public.creator_teardowns (created_at desc);
alter table public.creator_teardowns enable row level security;

-- Asked for the creator plan from its early-access page (the demand test's strongest signal).
alter table public.creator_leads add column if not exists wants_plan boolean not null default false;
