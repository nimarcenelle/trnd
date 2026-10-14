-- Free reports: one read of a business from the home page, before any
-- account. Written and read only with the service role (no policies); the
-- report's id is its link. Safe to re-run.

create table if not exists public.previews (
  id uuid primary key default gen_random_uuid(),
  -- The site as typed, normalized, and its host without www (one report per host a week).
  url text not null,
  domain text not null,
  status text not null default 'running', -- running | done | error
  -- Where the run is, in words ("Reading 41 ads").
  stage text,
  error text,
  -- { brand, companies, report }: lib/preview.ts PreviewBody.
  body jsonb,
  -- sha256 of the requester's IP, for the per-visitor daily limit.
  ip_hash text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists previews_domain_idx on public.previews (domain, created_at desc);
create index if not exists previews_ip_idx on public.previews (ip_hash, created_at desc);
create index if not exists previews_created_idx on public.previews (created_at desc);
alter table public.previews enable row level security;
