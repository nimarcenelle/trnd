-- The analyst note that opens each week's intel report — the one AI-written
-- (or deterministic-fallback) block on an otherwise data-derived page.
-- Persisted per (business, week) so the report is stable within a week.
create table public.intel_notes (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  week_of         date not null,
  headline        text not null,
  narrative       text[] not null default '{}',
  actions         text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now(),
  unique (business_id, week_of)
);
alter table public.intel_notes enable row level security;
create index intel_notes_business_week_idx on public.intel_notes (business_id, week_of desc);

create policy "intel_notes: via business" on public.intel_notes
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
