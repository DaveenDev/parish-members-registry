-- A weekly bulletin can carry a PDF (the design brief, 2.3): the website shows
-- a download link with the file's size, since mobile data is expensive. Run
-- after 0109_census_public_results.sql. Safe to re-run.
--
-- The file goes in the public "downloads" bucket from 0096 (so run that one
-- first), as "<uuid>.pdf", the same way the Downloads page's forms do; staff
-- who may edit the website can upload it (the bucket's existing rules).
-- bulletins.file_path / file_name / size_bytes say which file and how big.
-- The typed text stays the readable version; the PDF is in addition to it.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'downloads') then
    raise exception 'Run 0096_downloads.sql before this one (it makes the downloads bucket)';
  end if;
end;
$$;

alter table bulletins add column if not exists file_path text;
alter table bulletins add column if not exists file_name text;
alter table bulletins add column if not exists size_bytes bigint;
