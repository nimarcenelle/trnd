-- Three plans on access, metered on briefs a week, rivals tracked and
-- seats: starter, baseline (the pilot tier) and pro. Run after 0034.
-- Idempotent: pasted by hand, safe to re-run.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('trial', 'starter', 'baseline', 'pro'));
