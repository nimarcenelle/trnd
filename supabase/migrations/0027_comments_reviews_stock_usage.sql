-- The reads the four signals were promised and did not have: what customers
-- say under the brand's and its rivals' posts, what they say about the
-- rivals on Trustpilot, whether a product is in stock, and what every model
-- call costs. Run after 0026. Idempotent: pasted by hand, safe to re-run.

-- ---------------------------------------------------------- social comments
-- Comment text on a post the brand or a rival published. The Customer
-- signal's intent read needs what customers write, not what brands post;
-- "1 in 3 comments on your posts ask what the filter removes" is a claim
-- only this table can back.
create table if not exists public.social_comments (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  competitor_id    uuid references public.competitors (id) on delete cascade,
  platform         text not null check (platform in ('instagram','tiktok','facebook')),
  post_external_id text not null,
  external_id      text not null,
  author           text not null default '',
  text             text not null,
  likes            integer not null default 0,
  posted_at        timestamptz,
  captured_at      timestamptz not null default now()
);
alter table public.social_comments enable row level security;
create unique index if not exists social_comments_identity_idx
  on public.social_comments (business_id, platform, external_id);
create index if not exists social_comments_business_post_idx
  on public.social_comments (business_id, post_external_id);
drop policy if exists "social_comments: via business" on public.social_comments;
create policy "social_comments: via business" on public.social_comments
  for all using (public.owns_business(business_id))
  with check (public.owns_business(business_id));

-- ------------------------------------------------------------------ reviews
-- Trustpilot for online brands and their rivals; a rival's own site when it
-- publishes reviews as structured data. Google stays the local read.
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews
  add constraint reviews_source_check
  check (source in ('google','seed','trustpilot','site'));

-- -------------------------------------------------------------------- stock
-- Read from the store's public catalog once a day. Null means never read,
-- never "in stock".
alter table public.services
  add column if not exists in_stock boolean;

-- ----------------------------------------------------------------- ai usage
-- Every model call's tokens, by brand and by the job that made it. The
-- product had no idea what a brand's week cost in model calls.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid references public.businesses (id) on delete cascade,
  purpose        text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  created_at     timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_business_idx on public.ai_usage (business_id, created_at desc);
-- Written by the service role only; owners never read it from the app.
drop policy if exists "ai_usage: service only" on public.ai_usage;
create policy "ai_usage: service only" on public.ai_usage
  for all using (false) with check (false);
