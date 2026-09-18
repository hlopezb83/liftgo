-- 1. Forklifts: drop customer SELECT policy entirely; replace with safe RPC
DROP POLICY IF EXISTS "Customers read own rented forklifts" ON public.forklifts;

CREATE OR REPLACE FUNCTION public.get_customer_forklifts_brief()
RETURNS TABLE (id uuid, name text, model text, manufacturer text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT f.id, f.name, f.model, f.manufacturer
  FROM public.forklifts f
  WHERE has_role(auth.uid(), 'customer'::app_role)
    AND (
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.forklift_id = f.id
          AND b.customer_id = get_customer_id_for_user(auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.forklift_id = f.id
          AND c.customer_id = get_customer_id_for_user(auth.uid())
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_forklifts_brief() TO authenticated;

-- 2. company_settings: remove mechanic role from authenticated read policy
DROP POLICY IF EXISTS "Authenticated read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Mechanics read company_settings" ON public.company_settings;

CREATE POLICY "Back office read company_settings"
ON public.company_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'auditor'::app_role)
  OR has_role(auth.uid(), 'dispatcher'::app_role)
  OR has_role(auth.uid(), 'ventas'::app_role)
);

-- 3. Storage: remove auditor from documents upload policy
DROP POLICY IF EXISTS "Staff upload documents" ON storage.objects;

CREATE POLICY "Staff upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
  )
);