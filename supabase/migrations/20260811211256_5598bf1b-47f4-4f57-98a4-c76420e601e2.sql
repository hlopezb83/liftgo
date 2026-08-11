-- Tema 2: storage.objects (bucket documents) — coincidencia exacta de ruta en la policy de clientes
DROP POLICY IF EXISTS "Customers read own scoped documents" ON storage.objects;

CREATE POLICY "Customers read own scoped documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.has_role((select auth.uid()), 'customer'::app_role)
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.file_url IN (objects.name, 'documents/' || objects.name)
        AND (
          (d.entity_type = 'invoice' AND d.entity_id IN (
            SELECT i.id FROM public.invoices i
            WHERE i.customer_id = public.get_customer_id_for_user((select auth.uid()))
          ))
          OR (d.entity_type = 'contract' AND d.entity_id IN (
            SELECT c.id FROM public.contracts c
            WHERE c.customer_id = public.get_customer_id_for_user((select auth.uid()))
          ))
          OR (d.entity_type = 'booking' AND d.entity_id IN (
            SELECT b.id FROM public.bookings b
            WHERE b.customer_id = public.get_customer_id_for_user((select auth.uid()))
          ))
          OR (d.entity_type = 'delivery' AND d.entity_id IN (
            SELECT dl.id FROM public.deliveries dl
            WHERE dl.booking_id IN (
              SELECT b2.id FROM public.bookings b2
              WHERE b2.customer_id = public.get_customer_id_for_user((select auth.uid()))
            )
          ))
          OR (d.entity_type = 'damage' AND d.entity_id IN (
            SELECT dr.id FROM public.damage_records dr
            WHERE dr.customer_id = public.get_customer_id_for_user((select auth.uid()))
          ))
        )
    )
  );