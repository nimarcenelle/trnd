-- A brand may run more than one campaign type at once (purchases and leads,
-- say), so the objective becomes a list. The single value 0028 added is
-- carried over, then its column goes. Run after 0029.
-- Idempotent: pasted by hand, safe to re-run.

alter table public.businesses
  add column if not exists campaign_objectives text[] not null default '{}'::text[];

update public.businesses
  set campaign_objectives = array[campaign_objective]
  where campaign_objective is not null and campaign_objectives = '{}'::text[];

alter table public.businesses drop constraint if exists businesses_campaign_objective_check;
alter table public.businesses drop column if exists campaign_objective;

alter table public.businesses drop constraint if exists businesses_campaign_objectives_check;
alter table public.businesses
  add constraint businesses_campaign_objectives_check
  check (campaign_objectives <@ array['purchases','leads','traffic','awareness']::text[]);
