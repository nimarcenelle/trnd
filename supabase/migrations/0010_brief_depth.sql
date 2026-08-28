-- Brief v5: the founding analysis stops being a summary and becomes the
-- business's whole signal identity — a deep demand watchlist plus its own
-- classification vocabulary and communities, so the category configs are
-- scaffolding rather than the backbone.
alter table public.business_briefs
  add column lexicon text[] not null default '{}',
  add column subreddits text[] not null default '{}';
