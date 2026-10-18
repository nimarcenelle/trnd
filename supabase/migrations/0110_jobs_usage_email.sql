-- Production plumbing. Safe to re-run.
--
-- scan_jobs: scans run on the worker (worker/), not inside a time-limited
-- Vercel function. The app and the daily cron queue a job; the worker claims
-- jobs one at a time (claim_scan_job), retries failures, and picks up jobs a
-- crashed worker left running.

create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null default 'daily', -- daily | manual
  force_report boolean not null default false,
  status text not null default 'queued', -- queued | running | done | failed
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- One open job per brand: queueing again while one waits is a no-op.
create unique index if not exists scan_jobs_one_open_idx on public.scan_jobs (brand_id) where status in ('queued', 'running');
create index if not exists scan_jobs_queue_idx on public.scan_jobs (status, run_after);
alter table public.scan_jobs enable row level security;

create or replace function public.claim_scan_job(stale_minutes int default 30)
returns setof public.scan_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.scan_jobs j
     set status = 'running', attempts = j.attempts + 1, started_at = now()
   where j.id = (
     select q.id from public.scan_jobs q
      where (q.status = 'queued' and q.run_after <= now())
         or (q.status = 'running' and q.started_at < now() - make_interval(mins => stale_minutes))
      order by q.run_after, q.created_at
      limit 1
      for update skip locked
   )
  returning j.*;
end;
$$;
revoke execute on function public.claim_scan_job(int) from public, anon, authenticated;

-- ai_usage: every model call's tokens, per brand, for cost per customer and the daily budget.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  brand_id uuid references public.brands(id) on delete cascade,
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_brand_idx on public.ai_usage (brand_id, created_at desc);
alter table public.ai_usage enable row level security;

-- The owner can turn off the update emails (unsubscribe link, settings).
alter table public.brands add column if not exists email_updates boolean not null default true;
