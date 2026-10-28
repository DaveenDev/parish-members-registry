-- Readable photo file names on R2: article101_cover.jpg, article101_1.jpg,
-- article101_2.jpg… and event55_cover.jpg, so the bucket makes sense when
-- photos are moved by hand. Run after 0028_event_cover_photo.sql. Safe to re-run.
--
-- Photos are uploaded under a temporary name (the article or event may not
-- have an ID yet); once it's saved, the media-upload function renames them
-- ("name" action). These counters remember the last number given out, so a
-- name is never reused: photos are cached for a year, and a reused name
-- would keep showing the old photo.
--   cover_seq: covers given out (1 → <x>_cover.jpg, 2 → <x>_cover_2.jpg, …)
--   photo_seq: gallery photos given out (<x>_1.jpg, <x>_2.jpg, …)
-- Only the function (service role) changes them; the admin leaves them out.

alter table articles add column if not exists cover_seq integer not null default 0;
alter table articles add column if not exists photo_seq integer not null default 0;
alter table events   add column if not exists cover_seq integer not null default 0;
