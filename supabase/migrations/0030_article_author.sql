-- Who wrote each Blog Article (Parish Website → Blog Articles), shown on the
-- article page as "Sinulat ni …". Optional, free text (a person or a group,
-- e.g. "Parish Youth Ministry"). Run after 0029_photo_file_names.sql. Safe to re-run.

alter table articles add column if not exists author text;
