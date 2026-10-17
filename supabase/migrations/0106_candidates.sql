-- Setup keeps the competitor candidates it did not seat (the model's spares)
-- on the brand, so the first scan can swap a rival that runs no Meta ads for
-- the next closest one, and remembers what it swapped. Safe to re-run.
alter table public.brands add column if not exists candidates jsonb;
