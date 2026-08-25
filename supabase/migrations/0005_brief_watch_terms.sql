-- The founding analysis produces the business's demand watchlist: the search
-- phrases its real customers use, fed into signal ingestion so TRND watches
-- what THIS business sells — not just its category.
alter table public.business_briefs
  add column watch_terms text[] not null default '{}';
