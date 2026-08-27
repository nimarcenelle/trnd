-- Billing: one subscription row per business. Every business starts on a
-- 14-day trial; Stripe webhooks (service role) move it to a paid plan.
-- Owners can read their own row; all writes go through the service role so
-- a client can never grant itself a plan.
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null unique references public.businesses (id) on delete cascade,
  plan                    text not null default 'trial'
                          check (plan in ('trial', 'baseline', 'pro')),
  status                  text not null default 'trialing'
                          check (status in ('trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  current_period_end      timestamptz,
  trial_ends_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

create policy "subscriptions: owner reads" on public.subscriptions
  for select using (public.owns_business(business_id));

-- The trial row is created alongside the business by the app (owner insert);
-- plan/status changes arrive only via the service role, which bypasses RLS.
create policy "subscriptions: owner creates trial" on public.subscriptions
  for insert with check (
    public.owns_business(business_id) and plan = 'trial' and status = 'trialing'
  );

create index subscriptions_stripe_sub_idx on public.subscriptions (stripe_subscription_id);
