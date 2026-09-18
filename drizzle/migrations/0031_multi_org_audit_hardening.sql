-- =====================================================================
-- Multiempresa · Tramo 10: cierre de la auditoría (forward-only)
--
-- 1. Storage: toda operación autenticada exige que el PRIMER segmento de la
--    ruta sea exactamente el `organizations.id` ACTIVO de la membresía del
--    usuario. Desaparece la tolerancia al legado sin prefijo
--    (`p_require_prefix = false`) y una empresa suspendida pierde también el
--    acceso por Storage API. Una policy permisiva antigua ya no puede
--    saltarse la regla: se añade una policy RESTRICTIVE transversal.
-- 2. Clientes/portal: `customer_scope_matches` exige membresía INTERNA
--    verificada (una cuenta de portal con rol administrativo residual queda
--    fuera) y desaparece la compatibilidad de "una sola empresa activa" para
--    usuarios autenticados sin membresía. `soft_delete_customer` deja de
--    archivar globalmente sin contexto de organización.
-- 3. `organization_document_counters`: RLS habilitada sin policies
--    (deny-all para anon/authenticated); sólo `service_role` conserva grants.
-- 4. Plataforma: se retira el respaldo automático que convertía a los
--    administradores de la empresa fundadora en operadores de plataforma. La
--    autoridad se otorga explícitamente (`platform_grant_operator` /
--    bootstrap documentado por `service_role`).
-- 5. Alta de empresas en dos tiempos: la empresa nace INACTIVA (pending) y
--    sólo se activa dentro de la transacción que adjunta a su primer
--    administrador, después de validar usuario y membresía.
--
-- No mueve objetos de Storage ni datos de negocio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Contexto verificado: membresía + empresa activa
-- ---------------------------------------------------------------------

-- Organización de la sesión SOLO si la empresa está activa (cualquier tipo de
-- miembro). Sin membresía inequívoca o con empresa suspendida: NULL.
CREATE OR REPLACE FUNCTION public.current_active_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE o.id = public.current_organization_id()
    AND o.is_active
$$;

REVOKE ALL ON FUNCTION public.current_active_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_active_organization_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_active_organization_id()
  TO authenticated, service_role;

-- Organización de la sesión SOLO para personal interno de una empresa activa.
-- Una cuenta de portal (aunque conserve un rol administrativo residual)
-- obtiene NULL.
CREATE OR REPLACE FUNCTION public.current_internal_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1] END
  FROM public.organization_memberships m
  JOIN public.organizations o
    ON o.id = m.organization_id AND o.is_active
  WHERE m.auth_user_id = (SELECT auth.uid())
    AND m.member_type = 'internal'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m2
      WHERE m2.auth_user_id = (SELECT auth.uid())
        AND m2.member_type <> 'internal'
    )
$$;

REVOKE ALL ON FUNCTION public.current_internal_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_internal_organization_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_internal_organization_id()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Storage estricto por empresa
-- ---------------------------------------------------------------------

-- El prefijo sólo se reconoce si corresponde a una empresa ACTIVA.
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
    AND o.is_active
$$;

REVOKE ALL ON FUNCTION public.storage_prefix_organization(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_prefix_organization(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.storage_prefix_organization(text)
  TO authenticated, service_role;

-- El parámetro `p_require_prefix` se conserva por compatibilidad de firma con
-- las policies existentes, pero YA NO relaja nada: el prefijo es obligatorio
-- en lectura, alta, reemplazo y borrado.
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
  v_org uuid := public.current_active_organization_id();
  v_prefix uuid;
BEGIN
  IF v_org IS NULL THEN
    -- Sin membresía verificada o con empresa suspendida: fail-closed.
    RETURN false;
  END IF;
  v_prefix := public.storage_prefix_organization(p);
  RETURN v_prefix IS NOT NULL AND v_prefix = v_org;
END;
$$;

COMMENT ON FUNCTION public.storage_path_in_current_organization(text, boolean) IS
  'Tramo 10: el primer segmento de la ruta debe ser exactamente la organizacion activa de la sesion. p_require_prefix se ignora (compatibilidad de firma).';

REVOKE ALL ON FUNCTION public.storage_path_in_current_organization(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_path_in_current_organization(text, boolean) FROM anon;
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
      AND i.organization_id = public.current_active_organization_id()
  )
$$;

REVOKE ALL ON FUNCTION public.invoice_in_current_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoice_in_current_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.invoice_in_current_organization(uuid)
  TO authenticated, service_role;

-- Comprobante del portal: {organization_id}/{customer_id}/{invoice_id}/archivo
-- El legado sin prefijo deja de ser accesible por la Storage API.
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
  v_org uuid := public.current_active_organization_id();
  v_prefix uuid := public.storage_prefix_organization(p_name);
  v_rel text[];
  v_invoice uuid;
BEGIN
  IF v_customer IS NULL OR v_org IS NULL THEN
    RETURN false;
  END IF;
  IF v_prefix IS NULL OR v_prefix <> v_org THEN
    RETURN false;
  END IF;

  v_rel := (storage.foldername(p_name))[2:];

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
      AND i.organization_id = v_org
  );
END;
$$;

COMMENT ON FUNCTION public.payment_proof_path_allowed(text, boolean) IS
  'Tramo 10: exige prefijo de la organizacion activa tambien en lectura y borrado. p_require_prefix se ignora.';

REVOKE ALL ON FUNCTION public.payment_proof_path_allowed(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_proof_path_allowed(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.payment_proof_path_allowed(text, boolean)
  TO authenticated, service_role;

-- Documentos del portal: la empresa de la sesión debe estar activa.
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
      AND d.organization_id = public.current_active_organization_id()
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

REVOKE ALL ON FUNCTION public.customer_can_read_document_object(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_can_read_document_object(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_can_read_document_object(text)
  TO authenticated, service_role;

-- Red de seguridad transversal: ninguna policy permisiva (actual o histórica)
-- puede conceder acceso a un objeto fuera del prefijo de la empresa activa.
-- Todas las cubetas del proyecto son privadas y multiempresa; una cubeta nueva
-- también queda cubierta (fail-closed) hasta que se decida lo contrario.
DROP POLICY IF EXISTS storage_objects_org_prefix_guard ON storage.objects;
CREATE POLICY storage_objects_org_prefix_guard ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.storage_path_in_current_organization(name, true))
WITH CHECK (public.storage_path_in_current_organization(name, true));

-- ---------------------------------------------------------------------
-- 2. Alcance de filas por empresa: sin compatibilidad "una sola empresa"
--    para usuarios autenticados sin membresía.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organization_scope_matches(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_organization_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = p_organization_id AND o.is_active
     )
     AND (
       p_organization_id = public.current_organization_id()
       OR (
         -- Sólo procesos SIN sesión (sin auth.uid()) conservan la
         -- compatibilidad temporal, y únicamente con UNA empresa activa.
         (SELECT auth.uid()) IS NULL
         AND public.current_organization_id() IS NULL
         AND (SELECT count(*) = 1 FROM public.organizations WHERE is_active)
       )
     )
$$;

REVOKE ALL ON FUNCTION public.organization_scope_matches(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organization_scope_matches(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.organization_scope_matches(uuid)
  TO authenticated, service_role;

-- Personal interno únicamente: una cuenta de portal con rol administrativo
-- residual NO ve, modifica ni archiva los clientes de la empresa.
CREATE OR REPLACE FUNCTION public.customer_scope_matches(
  p_customer_id uuid,
  p_created_by_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_internal_organization_id() IS NOT NULL
     AND public.current_portal_customer_id() IS NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.organization_customers oc
         WHERE oc.customer_id = p_customer_id
           AND oc.organization_id = public.current_internal_organization_id()
       )
       OR p_created_by_organization_id = public.current_internal_organization_id()
     )
$$;

COMMENT ON FUNCTION public.customer_scope_matches(uuid, uuid) IS
  'Tramo 10: exige membresia INTERNA de una empresa activa. Sin membresia (o con cuenta de portal) devuelve false; no hay compatibilidad de una sola empresa activa.';

REVOKE ALL ON FUNCTION public.customer_scope_matches(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_scope_matches(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_scope_matches(uuid, uuid)
  TO authenticated, service_role;

-- Archivado de clientes: SECURITY DEFINER con identidad y empresa exigidas.
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_internal_organization_id();
  v_relation_status text;
  v_created_by uuid;
  v_shared boolean := false;
  v_balance numeric;
BEGIN
  -- Identidad + membresía interna + empresa activa (el helper ya exige las
  -- tres cosas). Una cuenta de portal, un usuario sin membresía o una empresa
  -- suspendida fallan cerrado, aunque conserven un rol administrativo.
  IF v_uid IS NULL OR v_org IS NULL OR public.current_portal_customer_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: se requiere una membresía interna verificada'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT oc.status INTO v_relation_status
  FROM public.organization_customers oc
  WHERE oc.organization_id = v_org AND oc.customer_id = p_customer_id;

  SELECT c.created_by_organization_id INTO v_created_by
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.deleted_at IS NULL;

  IF v_relation_status IS NULL AND v_created_by IS DISTINCT FROM v_org THEN
    -- Cliente de otra empresa e inexistente responden igual.
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;

  v_shared := EXISTS (
    SELECT 1 FROM public.organization_customers oc
    WHERE oc.customer_id = p_customer_id
      AND oc.organization_id <> v_org
      AND oc.status <> 'archived'
  );

  IF v_shared THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.customer_id = p_customer_id
        AND b.organization_id = v_org
        AND b.status IN ('confirmed', 'in_progress')
    ) THEN
      RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(SUM(b.balance_mxn), 0) INTO v_balance
    FROM public.v_invoices_with_balance b
    JOIN public.invoices i ON i.id = b.id
    WHERE b.customer_id = p_customer_id
      AND i.organization_id = v_org
      AND b.status IN ('sent', 'partial', 'overdue')
      AND COALESCE(b.cancellation_status, '') <> 'accepted';
    IF v_balance > 0.01 THEN
      RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo pendiente'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.organization_customers
    SET status = 'archived', updated_at = now()
    WHERE organization_id = v_org
      AND customer_id = p_customer_id
      AND status <> 'archived';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
    END IF;

    UPDATE public.customer_portal_accounts
    SET status = 'suspended', updated_at = now()
    WHERE organization_id = v_org
      AND customer_id = p_customer_id
      AND status = 'active';
    RETURN;
  END IF;

  -- Única empresa con relación vigente: además del archivado por relación se
  -- conserva el archivado histórico de la identidad global.
  IF public.customer_has_active_bookings(p_customer_id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene reservas activas'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.customer_has_outstanding_balance(p_customer_id) THEN
    RAISE EXCEPTION 'No se puede archivar: el cliente tiene saldo pendiente'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.customers
     SET deleted_at = now(),
         deleted_by = v_uid
   WHERE id = p_customer_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado o ya archivado';
  END IF;

  UPDATE public.organization_customers
  SET status = 'archived', updated_at = now()
  WHERE customer_id = p_customer_id
    AND organization_id = v_org
    AND status <> 'archived';

  UPDATE public.customer_portal_accounts
  SET status = 'suspended', updated_at = now()
  WHERE customer_id = p_customer_id
    AND organization_id = v_org
    AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. organization_document_counters: deny-all para anon/authenticated
--    (sólo funciones SECURITY DEFINER y service_role la tocan).
--    No se usa FORCE ROW LEVEL SECURITY: la tabla la escriben funciones
--    SECURITY DEFINER cuyo dueño es el propietario de la tabla, y forzar RLS
--    sin policies las dejaría sin poder emitir folios.
-- ---------------------------------------------------------------------
ALTER TABLE public.organization_document_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_document_counters FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_document_counters FROM anon;
REVOKE ALL ON TABLE public.organization_document_counters FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_document_counters
  TO service_role;

-- ---------------------------------------------------------------------
-- 4. Autoridad de plataforma explícita
-- ---------------------------------------------------------------------

-- Se retira el respaldo automático de 0030 (admins de la empresa fundadora).
-- Sólo se borran las filas con el marcador EXACTO del seed; cualquier
-- asignación explícita se conserva.
DELETE FROM public.platform_operators
WHERE notes = 'Respaldo inicial 0030: administrador interno de la organización fundadora';

-- Alta/baja explícita de operadores por otro operador ya verificado.
CREATE OR REPLACE FUNCTION public.platform_grant_operator(
  p_actor uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.platform_operators (auth_user_id, notes)
  VALUES (p_user_id, COALESCE(NULLIF(btrim(p_notes), ''), 'Asignación explícita'))
  ON CONFLICT (auth_user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_grant_operator(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_grant_operator(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_grant_operator(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_grant_operator(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_revoke_operator(
  p_actor uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF p_actor = p_user_id THEN
    RAISE EXCEPTION 'Un operador no puede retirarse a sí mismo la autoridad de plataforma'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.platform_operators WHERE auth_user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_revoke_operator(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_revoke_operator(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_revoke_operator(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_revoke_operator(uuid, uuid) TO service_role;

COMMENT ON TABLE public.platform_operators IS
  'Operadores de plataforma. La autoridad NO se deriva del rol admin de una empresa: se asigna explicitamente (bootstrap por service_role, documentado en docs/multiempresa/onboarding.md) o con platform_grant_operator.';

-- ---------------------------------------------------------------------
-- 5. Alta de empresa en dos tiempos (pending → activa con primer admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_actor uuid,
  p_name text,
  p_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'El nombre de la empresa debe tener entre 2 y 120 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION 'El identificador (slug) sólo admite minúsculas, dígitos y guiones (2 a 63 caracteres)'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Ya existe una empresa con ese identificador'
      USING ERRCODE = '23505';
  END IF;

  -- Alta incompleta = empresa INACTIVA (pending). Sin primer administrador no
  -- opera nadie, ni por RLS ni por Storage.
  INSERT INTO public.organizations (name, slug, is_active)
  VALUES (v_name, v_slug, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_attach_first_admin(
  p_actor uuid,
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_ok boolean;
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'La empresa ya tiene administradores; usa la invitación normal de usuarios'
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE auth_user_id = p_user_id) THEN
    RAISE EXCEPTION 'El usuario ya pertenece a una empresa' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.organization_id', p_organization_id::text, true);

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  VALUES (p_organization_id, p_user_id, 'internal');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET is_active = true
  WHERE user_id = p_user_id AND is_active IS DISTINCT FROM true;

  -- Activación dentro de la MISMA transacción, y sólo después de comprobar
  -- que la membresía interna quedó escrita.
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND auth_user_id = p_user_id
      AND member_type = 'internal'
  ) INTO v_membership_ok;

  IF NOT v_membership_ok THEN
    RAISE EXCEPTION 'No se pudo registrar la membresía del primer administrador'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.platform_operation', 'on', true);
  UPDATE public.organizations
  SET is_active = true, updated_at = now()
  WHERE id = p_organization_id AND is_active IS DISTINCT FROM true;
  PERFORM set_config('app.platform_operation', '', true);

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, source, organization_id)
  SELECT 'organizations', o.id, 'INSERT',
         jsonb_build_object('name', o.name, 'slug', o.slug, 'is_active', o.is_active,
                            'first_admin', p_user_id, 'platform_actor', p_actor),
         p_actor, 'user', o.id
  FROM public.organizations o
  WHERE o.id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_attach_first_admin(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_attach_first_admin(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_attach_first_admin(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_attach_first_admin(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 6. Verificación fail-closed del estado final
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF pg_get_functiondef('public.storage_path_in_current_organization(text, boolean)'::regprocedure)
       ILIKE '%RETURN NOT p_require_prefix%' THEN
    v_fallas := v_fallas || 'storage_path_in_current_organization sigue aceptando rutas legadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'storage_objects_org_prefix_guard'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    v_fallas := v_fallas || 'falta la policy RESTRICTIVE storage_objects_org_prefix_guard';
  END IF;

  IF pg_get_functiondef('public.customer_scope_matches(uuid, uuid)'::regprocedure)
       NOT ILIKE '%current_internal_organization_id%' THEN
    v_fallas := v_fallas || 'customer_scope_matches no exige membresia interna';
  END IF;

  IF pg_get_functiondef('public.soft_delete_customer(uuid)'::regprocedure)
       NOT ILIKE '%current_internal_organization_id%' THEN
    v_fallas := v_fallas || 'soft_delete_customer no exige membresia interna';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'organization_document_counters'
      AND c.relrowsecurity
  ) THEN
    v_fallas := v_fallas || 'organization_document_counters sin RLS habilitada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_document_counters'
  ) THEN
    v_fallas := v_fallas || 'organization_document_counters no debe tener policies';
  END IF;

  IF has_table_privilege('authenticated', 'public.organization_document_counters', 'SELECT')
     OR has_table_privilege('anon', 'public.organization_document_counters', 'SELECT') THEN
    v_fallas := v_fallas || 'organization_document_counters con grants de lectura indebidos';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_operators
    WHERE notes = 'Respaldo inicial 0030: administrador interno de la organización fundadora'
  ) THEN
    v_fallas := v_fallas || 'quedan operadores de plataforma sembrados por 0030';
  END IF;

  IF has_function_privilege('authenticated', 'public.platform_grant_operator(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.platform_grant_operator(uuid, uuid, text)', 'EXECUTE') THEN
    v_fallas := v_fallas || 'ACL de platform_grant_operator mas amplia de lo previsto';
  END IF;

  IF pg_get_functiondef('public.platform_create_organization(uuid, text, text)'::regprocedure)
       NOT ILIKE '%VALUES (v_name, v_slug, false)%' THEN
    v_fallas := v_fallas || 'platform_create_organization no crea la empresa inactiva';
  END IF;

  IF pg_get_functiondef('public.platform_attach_first_admin(uuid, uuid, uuid)'::regprocedure)
       NOT ILIKE '%SET is_active = true%' THEN
    v_fallas := v_fallas || 'platform_attach_first_admin no activa la empresa';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'MULTIEMPRESA 0031: estado final inesperado:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;
