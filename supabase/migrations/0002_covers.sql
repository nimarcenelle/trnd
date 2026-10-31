-- Video covers: TikTok's image links expire, so the free preview keeps its own
-- small JPEG of each of the creator's videos (lib/preview/covers.ts), by video
-- id. A public bucket: anyone can read a cover by its URL; only the server
-- (service role) writes. The stored URL is saved on each video in
-- previews.videos (jsonb), so no column is needed. Safe to re-run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 524288, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
