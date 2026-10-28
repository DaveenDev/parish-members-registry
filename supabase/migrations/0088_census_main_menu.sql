-- Whether an open census shows as CENSUS under Main in the admin sidebar.
-- Run after 0087_clergy_access.sql. Safe to re-run.
--
-- While a census is open, the sidebar shows a CENSUS shortcut under Main,
-- next to Parish Website, as well as Census under Registry. On (the default)
-- it shows; off it is hidden. Nothing shows while no census is open.
-- Set on the Census page by staff who can change parish settings.

alter table parish_settings add column if not exists census_in_main_menu boolean not null default true;
