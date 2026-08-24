-- 1) Learnings carry provenance: seeded priors are never presented as real
--    campaign history. 'measured' rows come only from recorded results.
alter table public.learnings
  add column source text not null default 'measured'
  check (source in ('seed', 'measured'));

-- 2) Business briefs — the positioning read generated when a business joins:
--    what they do well, their moat, edges to press in ads, and what to avoid.
create table public.business_briefs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null unique references public.businesses (id) on delete cascade,
  does_well       text[] not null default '{}',
  moat            text not null,
  advantages      text[] not null default '{}',
  watchouts       text[] not null default '{}',
  model_used      text not null,
  prompt_version  text not null,
  created_at      timestamptz not null default now()
);
alter table public.business_briefs enable row level security;

create policy "business_briefs: via business" on public.business_briefs
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
