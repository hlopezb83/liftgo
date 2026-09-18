-- BL-35: documents.uploaded_by TEXT → UUID FK a auth.users
-- Confirmado: 4 filas totales, todas con uploaded_by NULL. Conversión segura.
ALTER TABLE public.documents
  ALTER COLUMN uploaded_by TYPE uuid USING NULLIF(uploaded_by, '')::uuid;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON public.documents(uploaded_by)
  WHERE uploaded_by IS NOT NULL;

-- BL-37: purga de notifications para evitar crecimiento indefinido
CREATE OR REPLACE FUNCTION public.purge_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.notifications
  WHERE (read_at IS NOT NULL AND read_at < now() - INTERVAL '90 days')
     OR (read_at IS NULL     AND created_at < now() - INTERVAL '180 days');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_notifications() TO service_role;

-- Programar diariamente 04:00 UTC (22:00 America/Monterrey)
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-notifications-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-old-notifications-daily',
  '0 4 * * *',
  $$SELECT public.purge_old_notifications();$$
);