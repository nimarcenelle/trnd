-- Two more signal streams beside Meta ads: competitors' websites and their
-- marketing emails. Safe to re-run.
--
-- Websites: each scan snapshots a rival's homepage and product catalog
-- (site_snapshots, latest kept) and records what materially changed since the
-- last one (site_changes): products added or dropped, prices, sales, promos,
-- headline messaging.
--
-- Emails: every rival gets its own inbound address (rivals.inbox_token). TRND
-- signs it up to the rival's newsletter, or the owner does; whatever arrives is
-- stored in emails and tagged by the model.

alter table public.rivals add column if not exists inbox_token text;
create unique index if not exists rivals_inbox_token_idx on public.rivals (inbox_token);
-- null: not tried yet | subscribed: the signup form took it | manual: the owner must sign it up | receiving: mail arrives
alter table public.rivals add column if not exists email_status text;
alter table public.rivals add column if not exists email_note text;
alter table public.rivals add column if not exists site_checked_at timestamptz;

create table if not exists public.site_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  url text not null,
  -- { title, description, headlines[], promos[], nav[], products[{ id, title, price, compare_at, available, url }], text_hash }
  data jsonb not null,
  captured_at timestamptz not null default now()
);
create index if not exists site_snapshots_rival_idx on public.site_snapshots (rival_id, captured_at desc);

create table if not exists public.site_changes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  -- new_product | dropped_product | price_up | price_down | sale_started | sale_ended | promo_added | promo_removed | message_changed
  kind text not null,
  title text not null,
  before text,
  after text,
  url text,
  detected_at timestamptz not null default now()
);
create index if not exists site_changes_brand_idx on public.site_changes (brand_id, detected_at desc);

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rival_id uuid not null references public.rivals(id) on delete cascade,
  message_id text,
  from_address text,
  from_name text,
  subject text not null default '',
  preview text,
  body text,
  links jsonb not null default '[]',
  received_at timestamptz not null default now(),
  -- Set by the model: promo | launch | newsletter | content | retention | announcement | confirmation | other
  kind text,
  offer text,
  theme text,
  is_repeat boolean,
  unique (rival_id, message_id)
);
create index if not exists emails_brand_idx on public.emails (brand_id, received_at desc);

alter table public.site_snapshots enable row level security;
alter table public.site_changes enable row level security;
alter table public.emails enable row level security;

drop policy if exists site_snapshots_owner_read on public.site_snapshots;
create policy site_snapshots_owner_read on public.site_snapshots for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
drop policy if exists site_changes_owner_read on public.site_changes;
create policy site_changes_owner_read on public.site_changes for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
drop policy if exists emails_owner_read on public.emails;
create policy emails_owner_read on public.emails for select
  using (exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid()));
