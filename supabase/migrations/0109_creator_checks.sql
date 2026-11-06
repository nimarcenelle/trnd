-- Every completed creator check, kept so its result has a link of its own
-- (/c/<id>) with a preview image and a story image to post. Public posts'
-- public numbers only. Service role only. Safe to re-run.
create table if not exists public.creator_checks (
  -- Short and unguessable enough for a share link.
  id text primary key,
  handle text not null,
  platform text not null,
  display_name text,
  followers bigint,
  niche text,
  headline text not null,
  stats jsonb not null,
  read jsonb,
  src text,
  created_at timestamptz not null default now()
);
create index if not exists creator_checks_handle_idx on public.creator_checks (platform, handle, created_at desc);
alter table public.creator_checks enable row level security;
