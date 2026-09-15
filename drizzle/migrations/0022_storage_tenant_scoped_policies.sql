-- =====================================================================
-- Storage multiempresa · endurecimiento de 0021
--
-- 0021 hizo que las policies ignoraran el primer segmento cuando coincide
-- con CUALQUIER organizations.id, y despues comparaba solo customer_id /
-- invoice_id. Eso permite construir una ruta con el prefijo de OTRA empresa
-- y pasar el filtro (customer_id es identidad global y puede existir en
-- varias organizaciones).
--
-- Esta migracion hace la ruta tenant-aware de extremo a extremo:
--   - el prefijo debe ser la organizacion de la sesion (membresia real),
--   - la factura de la ruta debe pertenecer a esa misma organizacion,
--   - las subidas nuevas EXIGEN prefijo de organizacion,
--   - las rutas legadas (sin prefijo) solo se conservan para lectura/borrado
--     y nunca pueden construir una ruta cruzada (no llevan organizacion).
-- =====================================================================

-- 1. Helpers

CREATE OR REPLACE FUNCTION public.storage_prefix_organization(p text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE o.id::text = (storage.foldername(p))[1]
$$;

REVOKE ALL ON FUNCTION public.storage_prefix_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_prefix_organization(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.storage_path_in_current_organization(
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
  v_prefix uuid := public.storage_prefix_organization(p);
  v_org uuid := public.current_organization_id();
BEGIN
  IF v_prefix IS NULL THEN
    -- Objeto legado sin prefijo: no puede apuntar a otra organizacion.
    RETURN NOT p_require_prefix;
  END IF;
  RETURN v_org IS NOT NULL AND v_prefix = v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.storage_path_in_current_organization(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_path_in_current_organization(text, boolean)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invoice_in_current_organization(p_invoice_id uuid)
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
      AND i.organization_id IS NOT NULL
      AND i.organization_id = public.current_organization_id()
  )
$$;

REVOKE ALL ON FUNCTION public.invoice_in_current_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_in_current_organization(uuid)
  TO authenticated, service_role;

-- Ruta de comprobante del portal:
-- {organization_id}/{customer_id}/{invoice_id}/archivo
-- (legado: {customer_id}/{invoice_id}/archivo, solo lectura/borrado).
CREATE OR REPLACE FUNCTION public.payment_proof_path_allowed(
  p_name text,
  p_require_prefix boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_customer uuid := public.get_customer_id_for_user(auth.uid());
  v_org uuid := public.current_organization_id();
  v_prefix uuid := public.storage_prefix_organization(p_name);
  v_segments text[] := storage.foldername(p_name);
  v_rel text[];
  v_invoice uuid;
BEGIN
  IF v_customer IS NULL THEN
    RETURN false;
  END IF;

  IF v_prefix IS NULL THEN
    IF p_require_prefix THEN
      RETURN false;
    END IF;
    v_rel := v_segments;
  ELSE
    IF v_org IS NULL OR v_prefix <> v_org THEN
      RETURN false;
    END IF;
    v_rel := v_segments[2:];
  END IF;

  IF coalesce(array_length(v_rel, 1), 0) < 2 THEN
    RETURN false;
  END IF;

  IF v_rel[1] <> v_customer::text THEN
    RETURN false;
  END IF;

  BEGIN
    v_invoice := v_rel[2]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = v_invoice
      AND i.customer_id = v_customer
      AND (v_prefix IS NULL OR i.organization_id = v_prefix)
      AND (v_org IS NULL OR i.organization_id = v_org)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payment_proof_path_allowed(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_proof_path_allowed(text, boolean)
  TO authenticated, service_role;

-- 2. payment-proofs

DROP POLICY IF EXISTS "Customers upload own proofs" ON storage.objects;
CREATE POLICY "Customers upload own proofs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND public.payment_proof_path_allowed(name, true)
  AND (metadata ->> 'mimetype') = ANY (ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
);

DROP POLICY IF EXISTS "Customers read own proofs" ON storage.objects;
CREATE POLICY "Customers read own proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.payment_proof_path_allowed(name, false)
    OR (
      (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'administrativo'::app_role)
      )
      AND public.storage_path_in_current_organization(name, false)
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
        public.has_role((SELECT auth.uid()), 'admin'::app_role)
        OR public.has_role((SELECT auth.uid()), 'administrativo'::app_role)
      )
      AND public.storage_path_in_current_organization(name, false)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_payment_intents cpi
    WHERE cpi.proof_url = objects.name
      AND cpi.status <> 'pending_review'::payment_intent_status
  )
);

-- 3. feedback-screenshots: {organization_id}/{auth_user_id}/archivo

DROP POLICY IF EXISTS "Users upload own feedback screenshots" ON storage.objects;
CREATE POLICY "Users upload own feedback screenshots" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND public.storage_path_in_current_organization(name, true)
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

DROP POLICY IF EXISTS "Users read own feedback screenshots" ON storage.objects;
CREATE POLICY "Users read own feedback screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_path_in_current_organization(name, false)
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

DROP POLICY IF EXISTS "Users delete own feedback screenshots" ON storage.objects;
CREATE POLICY "Users delete own feedback screenshots" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND public.storage_path_in_current_organization(name, false)
  AND (auth.uid())::text = (public.storage_relative_segments(name))[1]
);

-- 4. documents: {organization_id}/{entity_type}/{entity_id}/archivo

DROP POLICY IF EXISTS "Staff read documents" ON storage.objects;
CREATE POLICY "Staff read documents" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.storage_path_in_current_organization(name, false)
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

-- 5. customer_payment_intents

DROP POLICY IF EXISTS "Customers create own payment intents" ON public.customer_payment_intents;
CREATE POLICY "Customers create own payment intents" ON public.customer_payment_intents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'customer'::app_role)
  AND customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
  AND status = 'pending_review'::payment_intent_status
  AND public.invoice_in_current_organization(invoice_id)
  AND invoice_id IN (
    SELECT invoices.id FROM public.invoices
    WHERE invoices.customer_id = public.get_customer_id_for_user((SELECT auth.uid()))
      AND invoices.status <> ALL (ARRAY['cancelled','draft'])
      AND invoices.cancellation_status IS DISTINCT FROM 'accepted'
  )
  AND (
    proof_url IS NULL
    OR (
      public.payment_proof_path_allowed(proof_url, true)
      AND (public.storage_relative_segments(proof_url))[2] = (invoice_id)::text
    )
  )
);
