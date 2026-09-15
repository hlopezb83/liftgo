CREATE OR REPLACE FUNCTION public.invoice_eligible_for_payment_intent(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND i.customer_id IS NOT NULL
      AND i.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
      AND i.organization_id IS NOT NULL
      AND i.organization_id = public.current_organization_id()
      AND i.status <> ALL (ARRAY['cancelled', 'draft'])
      AND i.cancellation_status IS DISTINCT FROM 'accepted'
  )
$$;

REVOKE ALL ON FUNCTION public.invoice_eligible_for_payment_intent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_eligible_for_payment_intent(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.invoice_eligible_for_payment_intent(uuid) IS
  'Fail-closed: la factura existe, pertenece al cliente portal de la sesion, esta en la organizacion actual y no esta cancelada/borrador. Evita subconsultas a invoices dentro de policies ejecutadas como authenticated.';

DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents" ON public.customer_payment_intents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
  AND status = 'pending_review'::payment_intent_status
  AND public.invoice_in_current_organization(invoice_id)
  AND public.invoice_eligible_for_payment_intent(invoice_id)
  AND (
    proof_url IS NULL
    OR (
      public.payment_proof_path_allowed(proof_url, true)
      AND (public.storage_relative_segments(proof_url))[2] = (invoice_id)::text
    )
  )
);