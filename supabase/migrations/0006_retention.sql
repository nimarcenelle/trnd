-- The weekly rhythm and referrals. The plan drops Tuesday 8 AM in the
-- creator's own timezone; last_plan_at lets the hourly cron see who is due
-- without reading every plan. A referral code per creator; a creator who
-- signed up through one remembers whose it was, and both get a free month
-- once the new account pays. Safe to re-run; paste into the Supabase SQL editor.

alter table public.creators add column if not exists timezone text;
alter table public.creators add column if not exists last_plan_at timestamptz;
update public.creators c set last_plan_at = p.at
  from (select creator_id, max(created_at) as at from public.plans group by creator_id) p
  where p.creator_id = c.id and c.last_plan_at is null;

alter table public.creators add column if not exists referral_code text;
create unique index if not exists creators_referral_code_idx on public.creators (referral_code) where referral_code is not null;
alter table public.creators add column if not exists referred_by uuid references public.creators(id) on delete set null;
-- When the free month for a referral was granted, so it is granted once.
alter table public.creators add column if not exists referral_rewarded_at timestamptz;
