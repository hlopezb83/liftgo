-- R5-08 (a): la policy INSERT de customer_payment_intents no verificaba que
-- proof_url apunte a la carpeta del propio cliente (el hook construye
-- proof_url como '<customer_id>/<invoice_id>/<ts>.<ext>').
DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents"
ON public.customer_payment_intents FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((select auth.uid()), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user((select auth.uid()))
  AND status = 'pending_review'::payment_intent_status
  AND invoice_id IN (
    SELECT id FROM public.invoices
    WHERE customer_id = public.get_customer_id_for_user((select auth.uid()))
  )
  AND (proof_url IS NULL OR (storage.foldername(proof_url))[1] = customer_id::text)
);

-- R5-08 (b): el NOT EXISTS de la policy DELETE de payment-proofs cruzaba
-- intents de CUALQUIER cliente, bloqueando borrados legitimos.
DROP POLICY IF EXISTS "Customers delete own pending proofs" ON storage.objects;
CREATE POLICY "Customers delete own pending proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'administrativo'::app_role)
    OR (
      (storage.foldername(name))[1] = public.get_customer_id_for_user((select auth.uid()))::text
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_payment_intents cpi
        WHERE cpi.proof_url = storage.objects.name
          AND cpi.customer_id = public.get_customer_id_for_user((select auth.uid()))
          AND cpi.status <> 'pending_review'::payment_intent_status
      )
    )
  )
);