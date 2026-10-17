-- Ad creatives kept by TRND. Facebook's image links expire after a while, so
-- each ad's image is copied to Supabase Storage the first time it's seen and
-- the app shows the copy. Safe to re-run.
alter table public.ads add column if not exists stored_image_url text;

-- A public bucket: the images are public ads, and the app links to them directly.
insert into storage.buckets (id, name, public)
values ('creatives', 'creatives', true)
on conflict (id) do update set public = true;
