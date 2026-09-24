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
