CREATE OR REPLACE FUNCTION public.customer_can_read_document_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.file_url = ANY (ARRAY[p_name, 'documents/' || p_name])
      AND (
        (d.entity_type = 'invoice' AND d.entity_id IN (
          SELECT i.id FROM public.invoices i
          WHERE i.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))))
        OR (d.entity_type = 'contract' AND d.entity_id IN (
          SELECT c.id FROM public.contracts c
          WHERE c.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))))
        OR (d.entity_type = 'booking' AND d.entity_id IN (
          SELECT b.id FROM public.bookings b
          WHERE b.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))))
        OR (d.entity_type = 'delivery' AND d.entity_id IN (
          SELECT dl.id FROM public.deliveries dl
          WHERE dl.booking_id IN (
            SELECT b2.id FROM public.bookings b2
            WHERE b2.customer_id = public.get_customer_id_for_user((SELECT auth.uid())))))
        OR (d.entity_type = 'damage' AND d.entity_id IN (
          SELECT dr.id FROM public.damage_records dr
          WHERE dr.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.customer_can_read_document_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_can_read_document_object(text) TO authenticated;

DROP POLICY IF EXISTS "Customers read own scoped documents" ON storage.objects;

CREATE POLICY "Customers read own scoped documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role((SELECT auth.uid()), 'customer'::app_role)
  AND public.customer_can_read_document_object(name)
);