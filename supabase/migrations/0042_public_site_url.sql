-- Parish Config → Parish profile → Public website address: where the QR
-- code and the census link on printed household sheets point. Blank means
-- https://olgqp-registry.vercel.app (DEFAULT_SITE_URL in
-- client/src/lib/census.js). Change it after moving to a custom domain;
-- sheets printed before keep working as long as the old address redirects.
-- Run after 0001_init.sql. Safe to re-run.
--
-- Staff-only like the rest of parish_settings; the public site never reads it.

alter table parish_settings add column if not exists site_url text;
