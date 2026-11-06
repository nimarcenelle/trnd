-- The niche benchmark a creator check was measured against: the top posts
-- under their niche hashtag at the time, and the gap to them. Safe to re-run.
alter table public.creator_checks add column if not exists benchmark jsonb;
