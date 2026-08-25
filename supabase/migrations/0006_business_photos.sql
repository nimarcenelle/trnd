-- Real photos harvested from the business's own website during onboarding —
-- ad previews and creative directions use these instead of placeholders.
alter table public.businesses
  add column photo_urls text[] not null default '{}';
