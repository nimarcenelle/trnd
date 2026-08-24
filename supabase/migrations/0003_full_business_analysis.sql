-- Business briefs grow into a full analysis: positioning, customer segments,
-- local market context, pricing read, seasonality, and concrete first moves.
-- Defaults keep pre-existing rows valid; the app regenerates any brief whose
-- prompt_version predates the current one.
alter table public.business_briefs
  add column positioning       text   not null default '',
  add column customer_segments text[] not null default '{}',
  add column market_context    text   not null default '',
  add column pricing_read      text   not null default '',
  add column seasonality       text   not null default '',
  add column first_moves       text[] not null default '{}';
