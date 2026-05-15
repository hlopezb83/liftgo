
-- 1) Restrict mechanics' SELECT on documents table to forklift/maintenance only
DROP POLICY IF EXISTS "Mechanics read documents" ON public.documents;
CREATE POLICY "Mechanics read documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'mechanic'::app_role)
    AND entity_type IN ('forklift', 'maintenance')
  );

-- 2) Restrict mechanics' SELECT on storage.objects (documents bucket) to forklift/maintenance prefixes
DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
CREATE POLICY "Staff read documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'administrativo'::app_role)
      OR has_role(auth.uid(), 'auditor'::app_role)
      OR has_role(auth.uid(), 'dispatcher'::app_role)
      OR has_role(auth.uid(), 'ventas'::app_role)
      OR (
        has_role(auth.uid(), 'mechanic'::app_role)
        AND (storage.foldername(name))[1] IN ('forklift', 'maintenance')
      )
    )
  );

-- 3) Remove direct SELECT access to billing_secrets columns; provide status-only RPC
DROP POLICY IF EXISTS "Admins full access billing_secrets" ON public.billing_secrets;
DROP POLICY IF EXISTS "Administrativo full access billing_secrets" ON public.billing_secrets;

-- Re-create write-only access (no SELECT) for admin/administrativo
CREATE POLICY "Admins write billing_secrets"
  ON public.billing_secrets
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Admins update billing_secrets"
  ON public.billing_secrets
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Admins delete billing_secrets"
  ON public.billing_secrets
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Status-only RPC: returns whether keys are configured, never the values
CREATE OR REPLACE FUNCTION public.get_billing_secrets_status()
RETURNS TABLE(id uuid, has_test_key boolean, has_live_key boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bs.id,
    (bs.facturapi_test_key IS NOT NULL AND length(bs.facturapi_test_key) > 0) AS has_test_key,
    (bs.facturapi_live_key IS NOT NULL AND length(bs.facturapi_live_key) > 0) AS has_live_key
  FROM public.billing_secrets bs
  WHERE has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'administrativo'::app_role)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_billing_secrets_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_secrets_status() TO authenticated;
