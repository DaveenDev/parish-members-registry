-- Takes the sample Downloads out of the training site (scripts/sample-downloads.mjs).
-- The files go with: npx supabase storage rm -r ss:///downloads/sample --project-ref qyoyuukpdjrwfhovtrwd --experimental
begin;
delete from download_files where file_path like 'sample/%';
delete from songs where title in ('Ginoo, Kaloy-i Kami', 'Amahan Namo', 'Magtigom Kita', 'Dayegon Ta ang Ginoo', 'Halad sa Among Kinabuhi', 'Sa Imong Pulong', 'Salamat, Ginoo', 'Amazing Grace', 'Holy, Holy, Holy', 'Silent Night', 'O Come, All Ye Faithful', 'Salve Regina', 'Ave Maria', 'Tantum Ergo');
commit;
