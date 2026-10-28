-- Parish Config → Platform Integrations → Email: the parish email that
-- password-reset links come from, and when a staff admin last confirmed a
-- test reset email arrived. The emails themselves are sent by Supabase Auth
-- through the parish Gmail, set up in the Supabase dashboard (see
-- docs/email-setup.md); no password is kept here.
-- Run after 0011_website_content.sql. Safe to re-run.
--
-- Not added to public_office_details(), so the public website never sees them.

alter table parish_settings add column if not exists outgoing_email text;
alter table parish_settings add column if not exists outgoing_name text;
alter table parish_settings add column if not exists password_reset_verified_at timestamptz;
