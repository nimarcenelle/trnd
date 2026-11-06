-- The creator paywall. A check is made through the onboarding (/check) and
-- read at /r/<id>?k=<access_token>; the full report shows once it is paid
-- (one checkout per check) or the browser carries an active creator plan.
-- Service role only. Safe to re-run.
alter table public.creator_checks add column if not exists email text;
alter table public.creator_checks add column if not exists goal text;
-- In the private report link; the share link (/c/<id>) never carries it.
alter table public.creator_checks add column if not exists access_token uuid not null default gen_random_uuid();
alter table public.creator_checks add column if not exists paid_at timestamptz;
alter table public.creator_checks add column if not exists stripe_session_id text;

-- A creator who paid: their Stripe customer and whether the plan is live.
create table if not exists public.creator_customers (
  stripe_customer_id text primary key,
  email text,
  subscription_id text,
  status text not null default 'active', -- active | past_due | canceled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.creator_customers enable row level security;
