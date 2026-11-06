-- Pricing and the funnel: four tiers, a waitlist for the tiers not sold yet,
-- one-time add-ons fulfilled by hand, and an event log for the metrics in
-- /app/admin. Service-role only (RLS on, no policies). Safe to re-run; paste
-- into the Supabase SQL editor.

-- Pro and Business, before they ship.
create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null,
  tier text not null, -- pro | business
  handle text,
  created_at timestamptz not null default now(),
  unique (email, tier)
);
alter table public.waitlist enable row level security;

-- Script packs and done-for-you months: paid in Stripe, made and delivered by the team.
create table if not exists public.addon_orders (
  id bigint generated always as identity primary key,
  creator_id uuid references public.creators(id) on delete set null,
  addon text not null, -- script_pack | done_for_you
  stripe_session_id text not null unique,
  amount_cents int,
  email text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.addon_orders enable row level security;

-- One row per thing that matters to the funnel: preview_started, account_created,
-- plan_viewed, checkout_started, paid, canceled, scorecard_opened, share_card,
-- referral_signup, waitlist. creator_id is null before an account exists.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  kind text not null,
  creator_id uuid references public.creators(id) on delete cascade,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_kind_time_idx on public.events (kind, created_at desc);
create index if not exists events_creator_idx on public.events (creator_id, kind);
alter table public.events enable row level security;
