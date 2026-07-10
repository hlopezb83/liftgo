DROP POLICY IF EXISTS "Public read company_settings" ON public.company_settings;

DROP POLICY IF EXISTS "Authenticated read supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Staff read supplier-bill-cfdi-xml"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  )
);