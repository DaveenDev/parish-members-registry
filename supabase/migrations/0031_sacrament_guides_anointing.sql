-- The sacrament guides list (Parish Website → Sacraments): a funeral isn't a
-- sacrament, so "Lubong (Funeral)" makes way for "Pagdihog sa Masakiton
-- (Anointing of the Sick)", and "Panalangin (Blessings)" is removed. The new
-- guide starts as an empty draft for staff to fill in and publish.
-- Run after 0011_website_content.sql. Safe to re-run.

insert into sacrament_guides (key, title, sort) values
  ('anointing', 'Pagdihog sa Masakiton (Anointing of the Sick)', 5)
on conflict (key) do nothing;

delete from sacrament_guides where key in ('funeral', 'blessing');
