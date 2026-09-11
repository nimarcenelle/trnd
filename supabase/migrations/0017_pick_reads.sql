-- The analyst's read on one pick: 2-3 model-written paragraphs on why this
-- term, for this business, this week — plus the questions an owner would ask
-- next, which seed the pick's Ask box. One row per opportunity; the
-- prompt_version carries a fingerprint of the facts it was written from, so
-- a read whose facts moved (new score, new match) is rewritten, not shown.
create table public.pick_reads (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  business_id     uuid not null references public.businesses (id) on delete cascade,
  paragraphs      text[] not null default '{}',
  questions       text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now(),
  unique (opportunity_id)
);
alter table public.pick_reads enable row level security;
create index pick_reads_business_idx on public.pick_reads (business_id);

create policy "pick_reads: via business" on public.pick_reads
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
