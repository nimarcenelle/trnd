-- Admitted: every AI result, saved under a key built from its inputs, so unchanged inputs
-- return the first result. Only the service role reads or writes it.
create table if not exists public.ai_results (
  key text primary key,
  kind text not null,
  value jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_results_kind_created on public.ai_results (kind, created_at);
alter table public.ai_results enable row level security;
