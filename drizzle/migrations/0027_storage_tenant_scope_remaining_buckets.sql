-- =====================================================================
-- Storage multiempresa · cierre de los buckets que 0021/0022 no cubrieron
--
-- 0022 dejó tenant-aware SOLO: payment-proofs (3 policies),
-- feedback-screenshots (las 3 del propio usuario) y la lectura de staff en
-- documents. Quedaron SIN prefijo de organización, y por tanto abiertas
-- entre empresas:
--   - documents: "Staff upload/update/delete documents" (alta, reemplazo y
--     borrado de objetos de CUALQUIER empresa) y
--     "Customers read own scoped documents" (su helper es SECURITY DEFINER y
--     resuelve por customer_id global, que puede existir en varias empresas).
--   - feedback-screenshots: "Admins read all" / "Admins delete any".
--   - cfdi-files: lectura/alta/reemplazo/borrado por admin.
--   - supplier-payment-receipts: las 4 policies.
--   - supplier-bill-cfdi-xml: las 4 policies.
--
-- Criterio (idéntico al de 0022; forward-only, sin tocar migraciones
-- históricas y sin mover objetos):
--   - INSERT exige prefijo = organización de la sesión.
--   - UPDATE: USING tolera legado (sin prefijo) pero nunca otra empresa, y
--     WITH CHECK exige prefijo propio, de modo que un objeto no puede
--     "moverse" al prefijo de otra empresa.
--   - SELECT/DELETE: toleran legado (sin prefijo no lleva empresa) y rechazan
--     cualquier prefijo distinto al de la sesión.
-- Los objetos históricos sin prefijo siguen legibles: este cambio NO altera
-- el plan de traslado ni mueve objetos.
-- =====================================================================

-- 1. Documentos del portal: acotar el helper a la empresa de la sesión.
--    (El mismo customer_id puede ser cliente de varias organizaciones.)
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
      AND d.organization_id IS NOT NULL
      AND d.organization_id = public.current_organization_id()
      AND (
        (d.entity_type = 'invoice' AND d.entity_id IN (
          SELECT i.id FROM public.invoices i
          WHERE i.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
            AND i.organization_id = d.organization_id))
        OR (d.entity_type = 'contract' AND d.entity_id IN (
          SELECT c.id FROM public.contracts c
          WHERE c.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
            AND c.organization_id = d.organization_id))
        OR (d.entity_type = 'booking' AND d.entity_id IN (
          SELECT b.id FROM public.bookings b
          WHERE b.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
            AND b.organization_id = d.organization_id))
        OR (d.entity_type = 'delivery' AND d.entity_id IN (
          SELECT dl.id FROM public.deliveries dl
          WHERE dl.organization_id = d.organization_id
            AND dl.booking_id IN (
              SELECT b2.id FROM public.bookings b2
              WHERE b2.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
                AND b2.organization_id = d.organization_id)))
        OR (d.entity_type = 'damage' AND d.entity_id IN (
          SELECT dr.id FROM public.damage_records dr
          WHERE dr.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
            AND dr.organization_id = d.organization_id))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.customer_can_read_document_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_can_read_document_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_can_read_document_object(text) TO service_role;

DROP POLICY IF EXISTS "Customers read own scoped documents" ON storage.objects;
CREATE POLICY "Customers read own scoped documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_role((SELECT auth.uid()), 'customer'::app_role)
  AND public.storage_path_in_current_organization(name, false)
  AND public.customer_can_read_document_object(name)
);

-- 2. documents: escritura de staff acotada por empresa.
DROP POLICY IF EXISTS "Staff upload documents" ON storage.objects;
CREATE POLICY "Staff upload documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  )
);

DROP POLICY IF EXISTS "Staff update documents" ON storage.objects;
CREATE POLICY "Staff update documents" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  )
);

DROP POLICY IF EXISTS "Staff delete documents" ON storage.objects;
CREATE POLICY "Staff delete documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
  )
);

-- 3. feedback-screenshots: ramas de administración.
DROP POLICY IF EXISTS "Admins read all feedback screenshots" ON storage.objects;
CREATE POLICY "Admins read all feedback screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete any feedback screenshot" ON storage.objects;
CREATE POLICY "Admins delete any feedback screenshot" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

-- 4. cfdi-files
DROP POLICY IF EXISTS "Admins can read cfdi-files" ON storage.objects;
CREATE POLICY "Admins can read cfdi-files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins write cfdi-files" ON storage.objects;
CREATE POLICY "Admins write cfdi-files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins update cfdi-files" ON storage.objects;
CREATE POLICY "Admins update cfdi-files" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'cfdi-files'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete cfdi-files" ON storage.objects;
CREATE POLICY "Admins delete cfdi-files" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cfdi-files'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

-- 5. supplier-payment-receipts
DROP POLICY IF EXISTS "Receipts read for admin/administrativo/auditor" ON storage.objects;
CREATE POLICY "Receipts read for admin/administrativo/auditor" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  )
);

DROP POLICY IF EXISTS "Receipts insert for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts insert for admin/administrativo" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Receipts update for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts update for admin/administrativo" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Receipts delete for admin/administrativo" ON storage.objects;
CREATE POLICY "Receipts delete for admin/administrativo" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-payment-receipts'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

-- 6. supplier-bill-cfdi-xml
DROP POLICY IF EXISTS "Staff read supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Staff read supplier-bill-cfdi-xml" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo insert supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo insert supplier-bill-cfdi-xml" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo update supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo update supplier-bill-cfdi-xml" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_path_in_current_organization(name, true)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

DROP POLICY IF EXISTS "Admin/Administrativo delete supplier-bill-cfdi-xml" ON storage.objects;
CREATE POLICY "Admin/Administrativo delete supplier-bill-cfdi-xml" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-bill-cfdi-xml'
  AND public.storage_path_in_current_organization(name, false)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
  )
);

-- =====================================================================
-- 7. Legado sin prefijo en `documents`: resolver propietario por la fila
--
-- Las rutas históricas (sin prefijo de organización) no llevan empresa en el
-- nombre, así que las policies anteriores las dejan accesibles a cualquier
-- staff. Para el bucket `documents` SÍ existe una forma segura de resolver el
-- propietario sin inventar datos ni mover objetos: la fila `public.documents`
-- que referencia esa ruta ya tiene `organization_id`.
--
-- Regla: si la ruta legada está referenciada por un documento de OTRA
-- organización, el staff de la sesión no puede leerla, reemplazarla ni
-- borrarla. Si no hay fila que la reclame (huérfanos históricos), se conserva
-- el comportamiento actual para no romper lecturas existentes.
--
-- ALCANCE (riesgo residual, no cerrado aquí): en `cfdi-files`,
-- `supplier-payment-receipts`, `supplier-bill-cfdi-xml` y
-- `feedback-screenshots` no hay columna que ligue la ruta legada con su
-- organización, por lo que los objetos históricos sin prefijo siguen siendo
-- accesibles para el staff de cualquier organización. Ese riesgo sólo se
-- cierra con el traslado de los objetos históricos al prefijo de su empresa,
-- que sigue pendiente de autorización.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.storage_document_owned_by_other_organization(p_name text)
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
      AND d.organization_id IS NOT NULL
      AND d.organization_id IS DISTINCT FROM public.current_organization_id()
  )
$$;

COMMENT ON FUNCTION public.storage_document_owned_by_other_organization(text) IS
  'true si la ruta de Storage esta reclamada por un documento de otra organizacion. Permite acotar rutas legadas sin prefijo en el bucket documents.';

REVOKE ALL ON FUNCTION public.storage_document_owned_by_other_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_document_owned_by_other_organization(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
CREATE POLICY "Staff read documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
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

DROP POLICY IF EXISTS "Staff update documents" ON storage.objects;
CREATE POLICY "Staff update documents" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, true)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
    OR public.has_role(auth.uid(), 'ventas'::app_role)
  )
);

DROP POLICY IF EXISTS "Staff delete documents" ON storage.objects;
CREATE POLICY "Staff delete documents" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
  AND NOT public.storage_document_owned_by_other_organization(name)
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'administrativo'::app_role)
    OR public.has_role(auth.uid(), 'dispatcher'::app_role)
  )
);
