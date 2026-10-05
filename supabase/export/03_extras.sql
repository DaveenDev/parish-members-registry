-- Pieces that live outside the public schema, so pg_dump's Supabase
-- schema dump leaves them out. Run AFTER 01_schema.sql and 02_data.sql.

-- New staff accounts get a profile row (auth.users trigger).
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_staff_profile();

-- GKK documents bucket (private, 20 MB limit).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gkk-documents', 'gkk-documents', false, 20971520,
  '{application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS gkk_documents_read ON storage.objects;
CREATE POLICY gkk_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'gkk-documents' AND public.staff_sees_gkk_document_path(name));

DROP POLICY IF EXISTS gkk_documents_upload ON storage.objects;
CREATE POLICY gkk_documents_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gkk-documents' AND public.staff_sees_gkk_document_path(name));

DROP POLICY IF EXISTS gkk_documents_delete ON storage.objects;
CREATE POLICY gkk_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'gkk-documents' AND public.staff_sees_gkk_document_path(name));

-- Staff morning digest (23:00 UTC = 07:00 Manila).
SELECT cron.unschedule('staff-morning-digest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'staff-morning-digest');
SELECT cron.schedule('staff-morning-digest', '0 23 * * *', 'select public.send_morning_digest()');

-- Live staff notifications in the app.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notifications;
  END IF;
END $$;
