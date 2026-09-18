-- 0032 · Multiempresa: las operaciones de PERSONAL sobre Storage exigen
-- membresía interna verificada, no sólo un rol global.
--
-- Hallazgo: storage_path_in_current_organization() se apoya en
-- current_active_organization_id(), que acepta cualquier tipo de membresía
-- (incluida 'portal'). Varias policies de Storage autorizan por rol global
-- (admin/administrativo/auditor/dispatcher/ventas/mechanic), así que una
-- cuenta de portal con un rol interno residual podía leer, reemplazar o
-- borrar archivos del personal de SU MISMA empresa, aunque el prefijo ya
-- estuviera aislado entre empresas.
--
-- Cierre: predicado propio para rutas de personal que exige membresía
-- 'internal' única en una empresa ACTIVA y ninguna membresía de portal.
-- Las policies de portal conservan su alcance de objeto propio.
-- Forward-only. No mueve objetos ni cambia buckets.

-- ---------------------------------------------------------------------
-- 1. Predicado de personal
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.storage_staff_path_in_current_organization(
  p text,
  p_require_prefix boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_org uuid := public.current_internal_organization_id();
  v_prefix uuid;
BEGIN
  IF v_org IS NULL THEN
    -- Sin membresía interna inequívoca, con membresía de portal o con la
    -- empresa suspendida: fail-closed, pase lo que pase con el rol global.
    RETURN false;
  END IF;
  v_prefix := public.storage_prefix_organization(p);
  RETURN v_prefix IS NOT NULL AND v_prefix = v_org;
END;
$$;

COMMENT ON FUNCTION public.storage_staff_path_in_current_organization(text, boolean) IS
  'Tramo 11: rutas de operaciones de personal. Exige membresia internal unica en empresa activa (sin membresia portal) y prefijo exacto. p_require_prefix se ignora (compatibilidad de firma).';

REVOKE ALL ON FUNCTION public.storage_staff_path_in_current_organization(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_staff_path_in_current_organization(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.storage_staff_path_in_current_organization(text, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Policies de personal · bucket documents
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
CREATE POLICY "Staff read documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'auditor'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
    OR public.has_role(auth.uid(), 'ventas'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'mechanic'::public.app_role)
      AND (public.storage_relative_segments(name))[1] = ANY (ARRAY['forklift', 'maintenance'])
    )
  )
);

DROP POLICY IF EXISTS "Staff upload documents" ON storage.objects;
CREATE POLICY "Staff upload documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
    OR public.has_role(auth.uid(), 'ventas'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff update documents" ON storage.objects;
CREATE POLICY "Staff update documents" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
    OR public.has_role(auth.uid(), 'ventas'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
    OR public.has_role(auth.uid(), 'ventas'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Staff delete documents" ON storage.objects;
CREATE POLICY "Staff delete documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::public.app_role)
  )
);

-- ---------------------------------------------------------------------
-- 3. Policies de personal · bucket cfdi-files
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can read cfdi-files" ON storage.objects;
CREATE POLICY "Admins can read cfdi-files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins write cfdi-files" ON storage.objects;
CREATE POLICY "Admins write cfdi-files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins update cfdi-files" ON storage.objects;
CREATE POLICY "Admins update cfdi-files" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete cfdi-files" ON storage.objects;
CREATE POLICY "Admins delete cfdi-files" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

-- ---------------------------------------------------------------------
-- 4. Policies de personal · bucket supplier-bill-cfdi-xml
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff read supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Staff read supplier-bill-cfdi-xml" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'auditor'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo insert supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo insert supplier-bill-cfdi-xml" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo update supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo update supplier-bill-cfdi-xml" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo delete supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo delete supplier-bill-cfdi-xml" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

-- ---------------------------------------------------------------------
-- 5. Policies de personal · bucket supplier-payment-receipts
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Receipts read for admin/administrativo/auditor" ON storage.objects;
CREATE POLICY "Receipts read for admin/administrativo/auditor" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
    OR public.has_role(auth.uid(), 'auditor'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Receipts insert for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts insert for admin/administrativo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Receipts update for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts update for admin/administrativo" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_staff_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Receipts delete for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts delete for admin/administrativo" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

-- ---------------------------------------------------------------------
-- 6. Policies de personal · bucket feedback-screenshots
--    (las policies de objeto propio por usuario NO cambian)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins read all feedback screenshots" ON storage.objects;
CREATE POLICY "Admins read all feedback screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete any feedback screenshot" ON storage.objects;
CREATE POLICY "Admins delete any feedback screenshot" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_staff_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
  )
);

-- ---------------------------------------------------------------------
-- 7. payment-proofs · rama de personal dentro de las policies de portal
--    El cliente conserva EXACTAMENTE su alcance (payment_proof_path_allowed).
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Customers read own proofs" ON storage.objects;
CREATE POLICY "Customers read own proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.payment_proof_path_allowed(name, false)
    OR (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'administrativo'::public.app_role)
      )
      AND public.storage_staff_path_in_current_organization(name, false)
    )
  )
);

DROP POLICY IF EXISTS "Customers delete own pending proofs" ON storage.objects;
CREATE POLICY "Customers delete own pending proofs" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.payment_proof_path_allowed(name, false)
    OR (
      (
        public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
      )
      AND public.storage_staff_path_in_current_organization(name, false)
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_payment_intents cpi
    WHERE cpi.proof_url = storage.objects.name
      AND cpi.status <> 'pending_review'::public.payment_intent_status
  )
);

-- ---------------------------------------------------------------------
-- 8. Verificación fail-closed de la propia migración
-- ---------------------------------------------------------------------

DO $verify$
DECLARE
  v_staff text[] := ARRAY[
    'Staff read documents',
    'Staff upload documents',
    'Staff update documents',
    'Staff delete documents',
    'Admins can read cfdi-files',
    'Admins write cfdi-files',
    'Admins update cfdi-files',
    'Admins delete cfdi-files',
    'Staff read supplier-bill-cfdi-xml',
    'Admin/Administrativo insert supplier-bill-cfdi-xml',
    'Admin/Administrativo update supplier-bill-cfdi-xml',
    'Admin/Administrativo delete supplier-bill-cfdi-xml',
    'Receipts read for admin/administrativo/auditor',
    'Receipts insert for admin/administrativo',
    'Receipts update for admin/administrativo',
    'Receipts delete for admin/administrativo',
    'Admins read all feedback screenshots',
    'Admins delete any feedback screenshot',
    'Customers read own proofs',
    'Customers delete own pending proofs'
  ];
  v_name text;
  v_def text;
  v_fallas text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_name IN ARRAY v_staff LOOP
    SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '')
      INTO v_def
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = v_name;

    IF v_def IS NULL THEN
      v_fallas := v_fallas || format('falta la policy %L', v_name);
    ELSIF v_def NOT ILIKE '%storage_staff_path_in_current_organization%' THEN
      v_fallas := v_fallas || format('la policy %L no exige membresia interna', v_name);
    END IF;
  END LOOP;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION '0032 incompleta: %', array_to_string(v_fallas, '; ');
  END IF;
END
$verify$;
