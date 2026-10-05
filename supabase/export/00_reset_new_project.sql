-- ONLY for the NEW project, before 01_schema.sql: wipes the public schema
-- (and any staff logins) so the import starts from empty. Anything left over
-- from earlier attempts or old migrations would otherwise stay in its old shape.
--
-- Refuses to run if the database already holds members, so it can't wipe
-- the live registry by mistake.

DO $$
BEGIN
  IF to_regclass('public.members') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.members LIMIT 1) THEN
    RAISE EXCEPTION 'public.members has rows: this looks like a live registry, not a new project. Nothing was changed.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DELETE FROM auth.users;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
