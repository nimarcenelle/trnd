-- The owner's own knowledge next to the market's: uploaded menus, sales
-- exports, brand guides, past ad results. The raw file is never stored —
-- text is extracted on upload and digested into facts; both live here.
create table public.business_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null,
  mime         text not null,
  bytes        integer not null default 0,
  text         text not null default '',
  digest       jsonb not null default '{}'::jsonb,
  model_used   text not null,
  created_at   timestamptz not null default now()
);
alter table public.business_documents enable row level security;
create index business_documents_business_idx on public.business_documents (business_id, created_at desc);

create policy "business_documents: via business" on public.business_documents
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));
