-- Rutas de Storage ahora inician con {organization_id}/. Las políticas basadas en
-- storage.foldername(name)[1] deben ignorar ese prefijo (y seguir funcionando con
-- objetos legados sin prefijo).
CREATE OR REPLACE FUNCTION public.storage_relative_segments(p text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id::text = (storage.foldername(p))[1]
    )
    THEN (storage.foldername(p))[2:]
    ELSE storage.foldername(p)
  END
$$;

GRANT EXECUTE ON FUNCTION public.storage_relative_segments(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_relative_segments(text) TO service_role;

-- payment-proofs
DROP POLICY IF EXISTS "Customers upload own proofs" ON storage.objects;
CREATE POLICY "Customers upload own proofs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (public.storage_relative_segments(name))[1] = (public.get_customer_id_for_user((SELECT auth.uid())))::text
  AND (metadata ->> 'mimetype') = ANY (ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
);

DROP POLICY IF EXISTS "Customers read own proofs" ON storage.objects;
CREATE POLICY "Customers read own proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    (public.storage_relative_segments(name))[1] = (public.get_customer_id_for_user(auth.uid()))::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Customers delete own pending proofs" ON storage.objects;
CREATE POLICY "Customers delete own pending proofs" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'administrativo'::app_role)
    OR (public.storage_relative_segments(name))[1] = (public.get_customer_id_for_user((SELECT auth.uid())))::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_payment_intents cpi
    WHERE cpi.proof_url = objects.name
      AND cpi.status <> 'pending_review'::payment_intent_status
  )
);

-- feedback-screenshots
DROP POLICY IF EXISTS "Users upload own feedback screenshots" ON storage.objects;
CREATE POLICY "Users upload own feedback screenshots" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

DROP POLICY IF EXISTS "Users read own feedback screenshots" ON storage.objects;
CREATE POLICY "Users read own feedback screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

DROP POLICY IF EXISTS "Users delete own feedback screenshots" ON storage.objects;
CREATE POLICY "Users delete own feedback screenshots" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

-- documents (rama de mecánicos)
DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
CREATE POLICY "Staff read documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
    OR (
      public.has_role(auth.uid(), 'mechanic'::app_role)
      AND (public.storage_relative_segments(name))[1] = ANY (ARRAY['forklift','maintenance'])
    )
  )
);

-- Intentos de pago del portal: el proof_url ahora incluye el prefijo de empresa.
DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents" ON public.customer_payment_intents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
  AND status = 'pending_review'::payment_intent_status
  AND invoice_id IN (
    SELECT invoices.id FROM public.invoices
    WHERE invoices.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
      AND invoices.status <> ALL (ARRAY['cancelled','draft'])
      AND invoices.cancellation_status IS DISTINCT FROM 'accepted'
  )
  AND (proof_url IS NULL OR (public.storage_relative_segments(proof_url))[1] = (customer_id)::text)
  AND (proof_url IS NULL OR (public.storage_relative_segments(proof_url))[2] = (invoice_id)::text)
);