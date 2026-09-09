-- Internal growth tool: discovered local-business leads for founder outreach.
-- Service-role only — RLS is enabled with no user policies on purpose, so the
-- anon/user keys can never read or write prospect data.

create table public.prospect_leads (
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

create index prospect_leads_status_idx on public.prospect_leads (status);
create index prospect_leads_best_email_idx on public.prospect_leads (best_email);
