
-- 1. Make documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- 2. Replace public read on documents bucket with role-scoped policies
DROP POLICY IF EXISTS "Public read documents" ON storage.objects;

CREATE POLICY "Staff read documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
    OR has_role(auth.uid(), 'mechanic'::app_role)
  )
);

CREATE POLICY "Customers read own scoped documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND has_role(auth.uid(), 'customer'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.file_url LIKE '%' || storage.objects.name
      AND (
        (d.entity_type = 'invoice'  AND d.entity_id IN (SELECT id FROM public.invoices  WHERE customer_id = get_customer_id_for_user(auth.uid())))
     OR (d.entity_type = 'contract' AND d.entity_id IN (SELECT id FROM public.contracts WHERE customer_id = get_customer_id_for_user(auth.uid())))
     OR (d.entity_type = 'booking'  AND d.entity_id IN (SELECT id FROM public.bookings  WHERE customer_id = get_customer_id_for_user(auth.uid())))
     OR (d.entity_type = 'delivery' AND d.entity_id IN (SELECT id FROM public.deliveries WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_id = get_customer_id_for_user(auth.uid()))))
     OR (d.entity_type = 'damage'   AND d.entity_id IN (SELECT id FROM public.damage_records WHERE customer_id = get_customer_id_for_user(auth.uid())))
      )
  )
);

-- 3. Remove mechanics SELECT on sensitive tables
DROP POLICY IF EXISTS "Mechanics read customers"   ON public.customers;
DROP POLICY IF EXISTS "Mechanics read deliveries"  ON public.deliveries;
DROP POLICY IF EXISTS "Mechanics read invoices"    ON public.invoices;
DROP POLICY IF EXISTS "Mechanics read contracts"   ON public.contracts;
DROP POLICY IF EXISTS "Mechanics read payments"    ON public.payments;
