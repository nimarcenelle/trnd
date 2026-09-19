-- A brand is a team, and a brief leaves the building. business_members
-- lets an owner invite the media buyer, the strategist and the creator by
-- email; a member sees the brand's data through the same row security the
-- owner does (owns_business now includes members), while the business row
-- itself stays the owner's to edit. A pick can carry a share token: the
-- brief at /share/<token> reads without an account, for the creator who
-- will never log in. Run after 0033. Idempotent: pasted by hand, safe to
-- re-run.

-- ------------------------------------------------------------ members
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  email        text not null,
  user_id      uuid references public.profiles (id) on delete set null,
  role         text not null default 'member' check (role in ('member')),
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (business_id, email)
);
alter table public.business_members enable row level security;
create index if not exists business_members_email_idx on public.business_members (lower(email));
create index if not exists business_members_user_idx on public.business_members (user_id);

-- The signed-in user's email, as the JWT carries it.
create or replace function public.session_email()
returns text
language sql
stable
as $$
  select lower(coalesce((select auth.jwt() ->> 'email'), ''));
$$;

-- A member is a row for this user, or for this user's email before the
-- first sign-in claimed it.
create or replace function public.is_member(b_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = b_id
      and (m.user_id = (select auth.uid()) or lower(m.email) = public.session_email())
  );
$$;

-- Every "via business" policy in the schema calls this: members now pass.
create or replace function public.owns_business(b_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = b_id and b.owner_id = (select auth.uid())
  ) or public.is_member(b_id);
$$;

-- Members read the business row; only the owner writes it.
drop policy if exists "businesses: member read" on public.businesses;
create policy "businesses: member read" on public.businesses
  for select using (public.is_member(id));

-- The owner manages the roster; a member sees the roster and claims their own row.
drop policy if exists "business_members: owner all" on public.business_members;
create policy "business_members: owner all" on public.business_members
  for all using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "business_members: member read" on public.business_members;
create policy "business_members: member read" on public.business_members
  for select using (public.is_member(business_id));
drop policy if exists "business_members: claim own" on public.business_members;
create policy "business_members: claim own" on public.business_members
  for update using (lower(email) = public.session_email())
  with check (lower(email) = public.session_email());

-- -------------------------------------------------------------- share
alter table public.picks add column if not exists share_token text;
create unique index if not exists picks_share_token_idx on public.picks (share_token) where share_token is not null;
