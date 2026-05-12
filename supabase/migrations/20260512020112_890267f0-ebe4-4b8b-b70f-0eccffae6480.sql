
-- 1. Storage: restrict documents DELETE/UPDATE to staff roles
DROP POLICY IF EXISTS "Authenticated delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update documents" ON storage.objects;

CREATE POLICY "Staff delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  )
);

CREATE POLICY "Staff update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  )
);

-- 2. Realtime: restrict notification channel subscriptions to the owning user
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own notification channel" ON realtime.messages;

CREATE POLICY "Users subscribe to own notification channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'notifications:' || auth.uid()::text
);
