-- The pre-signup demand snapshot: what TRND can say about a business from
-- its website alone, kept so the link stays shareable.
--
-- These rows are owned by nobody — they are generated before anyone signs
-- up. The token is the capability, so RLS is enabled with NO policies at
-- all: anon and authenticated clients can never read or write this table
-- directly, and every access goes through the server (service role), which
-- looks a row up by its token. That is deliberately stricter than a
-- "select using (true)" policy, which would let anyone enumerate every
-- snapshot ever built.
create table public.public_snapshots (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique,
  host           text not null,
  url            text not null,
  business_name  text not null default '',
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
alter table public.public_snapshots enable row level security;

create index public_snapshots_token_idx on public.public_snapshots (token);
-- A repeat ask for the same site reuses a fresh snapshot instead of
-- re-crawling someone's website.
create index public_snapshots_host_idx on public.public_snapshots (host, created_at desc);
