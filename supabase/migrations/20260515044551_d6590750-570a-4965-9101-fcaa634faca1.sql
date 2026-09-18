DROP POLICY IF EXISTS "Authenticated upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff update documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete documents" ON storage.objects;

CREATE POLICY "Staff upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role) OR
    has_role(auth.uid(), 'auditor'::app_role)
  )
);

CREATE POLICY "Staff update documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role) OR
    has_role(auth.uid(), 'mechanic'::app_role)
  )
);

CREATE POLICY "Staff delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents' AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'administrativo'::app_role) OR
    has_role(auth.uid(), 'dispatcher'::app_role)
  )
);

DROP POLICY IF EXISTS "Customers read forklifts" ON public.forklifts;
DROP POLICY IF EXISTS "Customers read own rented forklifts" ON public.forklifts;

CREATE POLICY "Customers read own rented forklifts"
ON public.forklifts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'customer'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.forklift_id = forklifts.id
      AND b.customer_id = get_customer_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Auditors view collection reminders" ON public.collection_reminders_log;
CREATE POLICY "Auditors view collection reminders"
ON public.collection_reminders_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'auditor'::app_role));

DROP POLICY IF EXISTS "Public read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Authenticated read company_settings" ON public.company_settings;
CREATE POLICY "Authenticated read company_settings"
ON public.company_settings FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role) OR
  has_role(auth.uid(), 'auditor'::app_role) OR
  has_role(auth.uid(), 'dispatcher'::app_role) OR
  has_role(auth.uid(), 'ventas'::app_role) OR
  has_role(auth.uid(), 'mechanic'::app_role)
);