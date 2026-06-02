CREATE POLICY "Admins can read cfdi-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'administrativo')
  )
);