-- =====================================================================
-- Multiempresa · Tramo 9: cierre funcional del modelo multiempresa.
--
--   1. Operadores de plataforma (`platform_operators`) y alta de empresas:
--      `platform_create_organization`, `platform_attach_first_admin`,
--      `platform_discard_organization`, `platform_set_organization_active`,
--      `platform_list_organizations`. Todas SECURITY DEFINER, ejecutables
--      SOLO por service_role y con verificación explícita del operador.
--   2. Suspensión de empresa: `organization_scope_matches` (policy
--      RESTRICTIVE `org_scope_isolation`) sólo reconoce organizaciones
--      activas; `resolve_organization_context` y
--      `enforce_organization_write_context` rechazan escrituras de miembros
--      de una empresa suspendida. `is_active` sólo cambia vía operador.
--   3. Alta de usuarios con varias empresas: `handle_new_user` toma
--      `raw_user_meta_data.organization_id` como contexto de escritura para
--      las filas de auditoría de profiles/user_roles (antes fallaba con
--      23514 en cuanto existía una segunda organización).
--   4. Clientes por empresa: `customers.created_by_organization_id`, la
--      relación `organization_customers` se crea para la empresa del usuario
--      (no sólo cuando había UNA organización), policies de personal acotadas
--      a la relación comercial (`customer_scope_matches`), vínculo por RFC
--      (`link_customer_to_organization_by_rfc`) y archivado por relación
--      cuando el cliente está compartido (`soft_delete_customer`).
--
-- Diseño aprobado (plan técnico multi-organización):
--   · `customers` sigue siendo identidad global (RFC único global).
--   · `organization_customers` guarda la relación comercial por empresa.
--   · Un usuario (interno o portal) pertenece a UNA sola organización.
--
-- Compatibilidad temporal conservada (igual que 0004..0029): sin membresía
-- y con UNA sola organización activa se sigue resolviendo esa empresa; con
-- varias, el contexto es obligatorio y se falla cerrado.
--
-- Transaccional (drizzle envuelve la corrida en una transacción). No usa
-- CONCURRENTLY. Verificación: supabase/tests/rls/multi_org_onboarding.sql y
-- supabase/tests/rls/multi_org_scope_coverage.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Operadores de plataforma
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_operators (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by   uuid NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  notes        text NULL
);

COMMENT ON TABLE public.platform_operators IS
  'Usuarios autorizados a crear/suspender empresas (operación de plataforma). Se administra por SQL del propietario de la plataforma; no hay UI de alta de operadores.';

ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operators FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_operators FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_operators FROM anon;
GRANT SELECT ON TABLE public.platform_operators TO authenticated;
GRANT ALL ON TABLE public.platform_operators TO service_role;

DROP POLICY IF EXISTS platform_operators_select_self ON public.platform_operators;
CREATE POLICY platform_operators_select_self
  ON public.platform_operators
  FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_operators po
    JOIN public.profiles p ON p.user_id = po.auth_user_id
    WHERE po.auth_user_id = (SELECT auth.uid())
      AND p.is_active
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated, service_role;

-- Respaldo inicial (sólo si la tabla está vacía): los administradores internos
-- activos de la organización fundadora (la más antigua activa). Sin esto no
-- existiría ningún actor capaz de dar de alta la segunda empresa.
INSERT INTO public.platform_operators (auth_user_id, notes)
SELECT m.auth_user_id,
       'Respaldo inicial 0030: administrador interno de la organización fundadora'
FROM public.organization_memberships m
JOIN public.user_roles r ON r.user_id = m.auth_user_id AND r.role = 'admin'::public.app_role
JOIN public.profiles p ON p.user_id = m.auth_user_id AND p.is_active
WHERE m.member_type = 'internal'
  AND m.organization_id = (
    SELECT id FROM public.organizations WHERE is_active ORDER BY created_at, id LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM public.platform_operators)
ON CONFLICT (auth_user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Suspensión de empresa: sólo las organizaciones activas participan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organization_scope_matches(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_organization_id IS NOT NULL
     -- Las filas de una empresa suspendida son invisibles para authenticated
     -- (service_role no pasa por RLS y sigue pudiendo operarlas).
     AND EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = p_organization_id AND o.is_active
     )
     AND (
       p_organization_id = public.current_organization_id()
       OR (
         -- Compatibilidad temporal: sin membresía sólo mientras haya UNA
         -- organización activa (y sólo para las filas de esa organización).
         public.current_organization_id() IS NULL
         AND (
           SELECT count(*) = 1
           FROM public.organizations
           WHERE is_active
         )
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.resolve_organization_context()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_active_organization_count integer;
BEGIN
  -- Para usuarios autenticados, la membresía es siempre la fuente de verdad.
  v_organization_id := public.current_organization_id();

  IF v_organization_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = v_organization_id AND o.is_active
    ) THEN
      RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
        USING ERRCODE = '42501';
    END IF;
    RETURN v_organization_id;
  END IF;

  -- Los procesos de servicio deben declarar explícitamente el contexto; mientras
  -- existe una sola organización activa se conserva la compatibilidad temporal.
  v_organization_id := NULLIF(
    current_setting('app.organization_id', true),
    ''
  )::uuid;

  IF v_organization_id IS NULL THEN
    SELECT count(*) INTO v_active_organization_count
    FROM public.organizations
    WHERE is_active;

    IF v_active_organization_count <> 1 THEN
      RAISE EXCEPTION
        'Se requiere contexto de organización para generar o validar folios (% organizaciones activas)',
        v_active_organization_count
        USING ERRCODE = '23514';
    END IF;

    SELECT id INTO v_organization_id
    FROM public.organizations
    WHERE is_active;
  END IF;

  RETURN v_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_organization_write_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_organization_id uuid;
  v_context_organization_id uuid;
  v_effective_organization_id uuid;
  v_organization_count integer;
BEGIN
  -- La organización forma parte de la identidad inmutable de una fila.
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'La organización de un registro no se puede cambiar'
      USING ERRCODE = '23514';
  END IF;

  v_member_organization_id := public.current_organization_id();
  v_context_organization_id := NULLIF(
    current_setting('app.organization_id', true),
    ''
  )::uuid;

  -- Un usuario autenticado siempre escribe exclusivamente en su propia
  -- organización. La columna se rellena si el cliente aún no la envía.
  IF v_member_organization_id IS NOT NULL THEN
    v_effective_organization_id := v_member_organization_id;

    IF NEW.organization_id IS NOT NULL
       AND NEW.organization_id IS DISTINCT FROM v_effective_organization_id THEN
      RAISE EXCEPTION 'La organización indicada no corresponde al usuario autenticado'
        USING ERRCODE = '42501';
    END IF;

    -- Tramo 9: una empresa suspendida no escribe, ni siquiera mediante
    -- funciones SECURITY DEFINER que no pasan por RLS.
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = v_effective_organization_id AND o.is_active
    ) THEN
      RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.organization_id IS NOT NULL THEN
    -- service_role puede procesar organizaciones distintas en sentencias
    -- consecutivas; un valor explícito siempre sustituye el contexto heredado.
    v_effective_organization_id := NEW.organization_id;
  ELSIF v_context_organization_id IS NOT NULL THEN
    v_effective_organization_id := v_context_organization_id;
  ELSE
    -- Compatibilidad temporal para los writers de sistema existentes: solo
    -- mientras haya una organización activa. Con varias, el contexto es
    -- obligatorio y no se adivina una organización.
    SELECT count(*) INTO v_organization_count
    FROM public.organizations
    WHERE is_active;

    IF v_organization_count <> 1 THEN
      RAISE EXCEPTION
        'organization_id es obligatorio para operaciones sin membresía cuando hay % organizaciones activas',
        v_organization_count
        USING ERRCODE = '23514';
    END IF;

    SELECT id INTO v_effective_organization_id
    FROM public.organizations
    WHERE is_active;
  END IF;

  NEW.organization_id := v_effective_organization_id;
  PERFORM set_config('app.organization_id', v_effective_organization_id::text, true);

  RETURN NEW;
END;
$$;

-- `is_active` sólo cambia dentro de una operación de plataforma verificada
-- (`platform_set_organization_active`). Un administrador de empresa conserva
-- `org_admin_manage` para nombre/slug, pero no puede suspender ni reactivar.
CREATE OR REPLACE FUNCTION public.guard_organization_active_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND coalesce(current_setting('app.platform_operation', true), '') <> 'on' THEN
    RAISE EXCEPTION 'El estado activo de una empresa sólo lo cambia un operador de plataforma'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_organization_active_flag() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_active_flag() FROM anon;

DROP TRIGGER IF EXISTS trg_organization_active_flag ON public.organizations;
CREATE TRIGGER trg_organization_active_flag
  BEFORE UPDATE OF is_active ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_organization_active_flag();

-- ---------------------------------------------------------------------
-- 3. Funciones de plataforma (service_role + operador verificado)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_platform_operator(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.platform_operators po
    JOIN public.profiles p ON p.user_id = po.auth_user_id
    WHERE po.auth_user_id = p_actor
      AND p.is_active
  ) THEN
    RAISE EXCEPTION 'Forbidden: se requiere un operador de plataforma activo'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_platform_operator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_platform_operator(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_platform_operator(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_platform_operator(uuid) TO service_role;

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

  INSERT INTO public.organizations (name, slug, is_active)
  VALUES (v_name, v_slug, true)
  RETURNING id INTO v_id;

  -- El rastro de auditoría se escribe al adjuntar al primer administrador
  -- (alta completa); así una empresa descartada por compensación no deja
  -- filas inmutables en audit_logs que impidan eliminarla.
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_create_organization(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(uuid, text, text) TO service_role;

-- Primer administrador: membresía interna + rol admin + perfil activo, en una
-- sola transacción. Sólo para una empresa que todavía no tiene miembros internos
-- y para un usuario que no pertenece a ninguna empresa.
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

  -- Alta completa: rastro de auditoría atribuido a la nueva empresa.
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

-- Compensación del alta: elimina una empresa recién creada que quedó sin
-- miembros. Si algo ya la referencia (FK RESTRICT), la deja suspendida.
CREATE OR REPLACE FUNCTION public.platform_discard_organization(
  p_actor uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF EXISTS (
    SELECT 1 FROM public.organization_memberships WHERE organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'La empresa tiene miembros; no se puede descartar'
      USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('app.platform_operation', 'on', true);

  -- audit_logs es inmutable: si algo ya referencia la empresa (FK RESTRICT)
  -- no se elimina, se deja suspendida.
  BEGIN
    DELETE FROM public.organizations WHERE id = p_organization_id;
    PERFORM set_config('app.platform_operation', '', true);
    RETURN FOUND;
  EXCEPTION WHEN foreign_key_violation THEN
    UPDATE public.organizations
    SET is_active = false, updated_at = now()
    WHERE id = p_organization_id;
    PERFORM set_config('app.platform_operation', '', true);
    RETURN false;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_discard_organization(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_discard_organization(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_discard_organization(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_discard_organization(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_set_organization_active(
  p_actor uuid,
  p_organization_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Se requiere el estado deseado' USING ERRCODE = '22023';
  END IF;

  -- Un operador no puede suspender su propia empresa (se bloquearía a sí mismo).
  IF NOT p_active AND EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE auth_user_id = p_actor AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'No puedes suspender la empresa a la que perteneces'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.platform_operation', 'on', true);
  PERFORM set_config('app.organization_id', p_organization_id::text, true);

  UPDATE public.organizations
  SET is_active = p_active, updated_at = now()
  WHERE id = p_organization_id AND is_active IS DISTINCT FROM p_active;

  -- La ventana de operación de plataforma se cierra de inmediato: el resto de
  -- la transacción vuelve a estar sujeto al guard de is_active.
  PERFORM set_config('app.platform_operation', '', true);

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
      RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
    END IF;
    RETURN; -- ya estaba en el estado pedido
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, source, organization_id)
  VALUES (
    'organizations', p_organization_id, 'UPDATE',
    jsonb_build_object('is_active', p_active, 'platform_actor', p_actor),
    p_actor, 'user', p_organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_organization_active(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_set_organization_active(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.platform_set_organization_active(uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_organization_active(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_list_organizations(p_actor uuid)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  is_active boolean,
  created_at timestamptz,
  internal_members bigint,
  portal_accounts bigint,
  customers bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_platform_operator(p_actor);

  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.is_active, o.created_at,
         (SELECT count(*) FROM public.organization_memberships m
           WHERE m.organization_id = o.id AND m.member_type = 'internal'),
         (SELECT count(*) FROM public.customer_portal_accounts a
           WHERE a.organization_id = o.id AND a.status = 'active'),
         (SELECT count(*) FROM public.organization_customers oc
           WHERE oc.organization_id = o.id AND oc.status <> 'archived')
  FROM public.organizations o
  ORDER BY o.created_at, o.id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_organizations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_list_organizations(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_list_organizations(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_organizations(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Alta de usuarios de Auth con varias empresas
-- ---------------------------------------------------------------------
-- `handle_new_user` inserta profile + rol; sus triggers de auditoría escriben
-- en audit_logs, que exige contexto de organización. El alta administrativa
-- (invitación interna, portal y primer administrador) envía
-- `organization_id` en los metadatos del usuario; aquí se convierte en
-- contexto local de la transacción. NO crea membresías: la membresía la crea
-- siempre el flujo verificado del servidor.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_text text := NULLIF(btrim(coalesce(NEW.raw_user_meta_data->>'organization_id', '')), '');
  v_org uuid;
BEGIN
  IF v_org_text IS NOT NULL
     AND v_org_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT o.id INTO v_org FROM public.organizations o WHERE o.id = v_org_text::uuid;
    IF v_org IS NOT NULL THEN
      PERFORM set_config('app.organization_id', v_org::text, true);
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Clientes por empresa
-- ---------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS created_by_organization_id uuid NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.customers.created_by_organization_id IS
  'Empresa que dio de alta la identidad global del cliente. La relación comercial vive en organization_customers.';

CREATE INDEX IF NOT EXISTS idx_customers_created_by_organization
  ON public.customers (created_by_organization_id);

-- Backfill: la empresa de la relación más antigua; sin relación, la única activa.
DO $$
BEGIN
  PERFORM set_config('app.audit_source', 'system', true);

  UPDATE public.customers c
  SET created_by_organization_id = src.organization_id
  FROM (
    SELECT DISTINCT ON (oc.customer_id) oc.customer_id, oc.organization_id
    FROM public.organization_customers oc
    ORDER BY oc.customer_id, oc.created_at, oc.organization_id
  ) src
  WHERE src.customer_id = c.id
    AND c.created_by_organization_id IS NULL;

  IF (SELECT count(*) FROM public.organizations WHERE is_active) = 1 THEN
    UPDATE public.customers c
    SET created_by_organization_id = (SELECT id FROM public.organizations WHERE is_active)
    WHERE c.created_by_organization_id IS NULL;
  END IF;
END;
$$;

-- 5a. Dueño de la identidad: se fija en el alta y no cambia.
CREATE OR REPLACE FUNCTION public.set_customer_owner_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_org uuid;
  v_ctx uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by_organization_id IS DISTINCT FROM OLD.created_by_organization_id THEN
      -- Sólo se admite completar un valor nulo desde un proceso de sistema.
      IF OLD.created_by_organization_id IS NOT NULL OR auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'La empresa que dio de alta al cliente no se puede cambiar'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  v_member_org := public.current_organization_id();

  IF v_member_org IS NOT NULL THEN
    IF NEW.created_by_organization_id IS NOT NULL
       AND NEW.created_by_organization_id IS DISTINCT FROM v_member_org THEN
      RAISE EXCEPTION 'La organización indicada no corresponde al usuario autenticado'
        USING ERRCODE = '42501';
    END IF;
    -- resolve_organization_context valida además que la empresa esté activa
    -- (una empresa suspendida no da de alta clientes).
    NEW.created_by_organization_id := public.resolve_organization_context();
  ELSIF NEW.created_by_organization_id IS NULL THEN
    -- service_role / procesos de sistema: app.organization_id o, por
    -- compatibilidad, la única empresa activa. Con varias empresas y sin
    -- contexto NO se adivina un dueño: la identidad queda sin empresa y sin
    -- relación automática (invisible para el personal hasta que se vincule).
    v_ctx := NULLIF(current_setting('app.organization_id', true), '')::uuid;
    IF v_ctx IS NULL
       AND (SELECT count(*) FROM public.organizations WHERE is_active) = 1 THEN
      SELECT id INTO v_ctx FROM public.organizations WHERE is_active;
    END IF;
    NEW.created_by_organization_id := v_ctx;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_customer_owner_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_customer_owner_organization() FROM anon;

DROP TRIGGER IF EXISTS trg_customer_owner_organization ON public.customers;
CREATE TRIGGER trg_customer_owner_organization
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_owner_organization();

-- 5b. Relación comercial automática para la empresa que da de alta al cliente.
-- Se conserva el nombre de la función (ACL revocada en 0028 y verificada por
-- function_acl_revoke_anon_0028.sql); el cuerpo ya no depende de que exista
-- UNA sola organización.
CREATE OR REPLACE FUNCTION public.ensure_single_active_organization_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid := NEW.created_by_organization_id;
BEGIN
  IF v_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.organization_customers (
    organization_id, customer_id, alias, razon_social, rfc, regimen_fiscal,
    uso_cfdi, domicilio_fiscal_cp, representante_legal, contact_person,
    email, phone, billing_address, tax_rate, status, notes
  )
  VALUES (
    v_organization_id, NEW.id, NEW.company, NEW.razon_social, NEW.rfc,
    NEW.regimen_fiscal, NEW.uso_cfdi, NEW.domicilio_fiscal_cp,
    NEW.representante_legal, NEW.contact_person, NEW.email, NEW.phone,
    COALESCE(NEW.billing_address, NEW.address), NEW.tax_rate,
    CASE WHEN NEW.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END,
    NEW.notes
  )
  ON CONFLICT (organization_id, customer_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ensure_single_active_organization_customer() IS
  'Tramo 9: crea la relación organization_customers para la empresa que dio de alta al cliente (created_by_organization_id). El nombre se conserva por compatibilidad de ACL.';

-- 5c. Visibilidad del personal: relación comercial con SU empresa (cualquier
-- estado, para que facturas/reservas históricas de clientes archivados sigan
-- resolviendo el nombre) o identidad creada por su empresa aún sin relación.
CREATE OR REPLACE FUNCTION public.customer_scope_matches(
  p_customer_id uuid,
  p_created_by_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.current_organization_id() IS NOT NULL THEN
      EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = public.current_organization_id() AND o.is_active
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.organization_customers oc
          WHERE oc.customer_id = p_customer_id
            AND oc.organization_id = public.current_organization_id()
        )
        OR p_created_by_organization_id = public.current_organization_id()
      )
    ELSE
      -- Compatibilidad temporal (misma regla que organization_scope_matches):
      -- sin membresía sólo mientras exista UNA organización activa.
      (SELECT count(*) = 1 FROM public.organizations WHERE is_active)
  END
$$;

REVOKE ALL ON FUNCTION public.customer_scope_matches(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_scope_matches(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_scope_matches(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins full access customers" ON public.customers;
CREATE POLICY "Admins full access customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  );

DROP POLICY IF EXISTS "Administrativo full access customers" ON public.customers;
CREATE POLICY "Administrativo full access customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  );

DROP POLICY IF EXISTS "Ventas full access customers" ON public.customers;
CREATE POLICY "Ventas full access customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'ventas'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'ventas'::public.app_role)
    AND public.customer_scope_matches(id, created_by_organization_id)
  );

DROP POLICY IF EXISTS "Auditor read customers" ON public.customers;
CREATE POLICY "Auditor read customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'auditor'::public.app_role)
    AND is_e2e IS NOT TRUE
    AND public.customer_scope_matches(id, created_by_organization_id)
  );

DROP POLICY IF EXISTS "Dispatchers read customers" ON public.customers;
CREATE POLICY "Dispatchers read customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'dispatcher'::public.app_role)
    AND is_e2e IS NOT TRUE
    AND public.customer_scope_matches(id, created_by_organization_id)
  );

-- 5d. Vincular un cliente existente (RFC único global) a la empresa actual.
-- Devuelve el id del cliente vinculado, o NULL si ningún cliente activo tiene
-- ese RFC (el llamador entonces crea la identidad nueva).
CREATE OR REPLACE FUNCTION public.link_customer_to_organization_by_rfc(
  p_rfc text,
  p_alias text DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_organization_id();
  v_rfc text := upper(btrim(coalesce(p_rfc, '')));
  v_customer public.customers%ROWTYPE;
  v_status text;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden: se requiere una membresía interna verificada'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'administrativo'::public.app_role)
          OR public.has_role(v_uid, 'ventas'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.current_portal_customer_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org AND o.is_active) THEN
    RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
      USING ERRCODE = '42501';
  END IF;
  IF v_rfc = '' OR v_rfc = 'XAXX010101000' THEN
    RAISE EXCEPTION 'Se requiere un RFC identificable para vincular un cliente'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE upper(c.rfc) = v_rfc
    AND c.deleted_at IS NULL
  ORDER BY c.created_at
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT oc.status INTO v_status
  FROM public.organization_customers oc
  WHERE oc.organization_id = v_org AND oc.customer_id = v_customer.id;

  IF v_status IS NOT NULL THEN
    IF v_status = 'archived' THEN
      UPDATE public.organization_customers
      SET status = 'active', updated_at = now()
      WHERE organization_id = v_org AND customer_id = v_customer.id;
    END IF;
    RETURN v_customer.id;
  END IF;

  INSERT INTO public.organization_customers (
    organization_id, customer_id, alias, razon_social, rfc, regimen_fiscal,
    uso_cfdi, domicilio_fiscal_cp, representante_legal, contact_person,
    email, phone, billing_address, tax_rate, status, notes
  )
  VALUES (
    v_org, v_customer.id,
    COALESCE(NULLIF(btrim(p_alias), ''), v_customer.company),
    v_customer.razon_social, v_customer.rfc, v_customer.regimen_fiscal,
    v_customer.uso_cfdi, v_customer.domicilio_fiscal_cp, v_customer.representante_legal,
    COALESCE(NULLIF(btrim(p_contact_person), ''), v_customer.contact_person),
    COALESCE(NULLIF(btrim(p_email), ''), v_customer.email),
    COALESCE(NULLIF(btrim(p_phone), ''), v_customer.phone),
    COALESCE(v_customer.billing_address, v_customer.address), v_customer.tax_rate,
    'active', v_customer.notes
  );

  RETURN v_customer.id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer_to_organization_by_rfc(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_to_organization_by_rfc(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_customer_to_organization_by_rfc(text, text, text, text, text) TO authenticated, service_role;

-- 5e. Archivado: por relación cuando el cliente está compartido con otra
-- empresa; global (comportamiento histórico) cuando la empresa actual es la
-- única con relación vigente o cuando no hay membresía (compatibilidad).
CREATE OR REPLACE FUNCTION public.soft_delete_customer(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid := public.current_organization_id();
  v_relation_status text;
  v_created_by uuid;
  v_shared boolean := false;
  v_balance numeric;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org AND o.is_active) THEN
      RAISE EXCEPTION 'La empresa está suspendida; no se permiten operaciones'
        USING ERRCODE = '42501';
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
  END IF;

  -- Única empresa con relación vigente (o compatibilidad sin membresía):
  -- archivado global histórico + relación y portal de la empresa actual.
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
    AND status <> 'archived'
    AND (v_org IS NULL OR organization_id = v_org);

  UPDATE public.customer_portal_accounts
  SET status = 'suspended', updated_at = now()
  WHERE customer_id = p_customer_id
    AND status = 'active'
    AND (v_org IS NULL OR organization_id = v_org);
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Verificación fail-closed del estado final
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_fallas text[] := '{}';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_operators'
      AND policyname = 'platform_operators_select_self'
  ) THEN
    v_fallas := v_fallas || 'platform_operators sin policy de lectura propia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'created_by_organization_id'
  ) THEN
    v_fallas := v_fallas || 'customers.created_by_organization_id ausente';
  END IF;

  IF (SELECT count(*) FROM public.organizations WHERE is_active) = 1
     AND EXISTS (SELECT 1 FROM public.customers WHERE created_by_organization_id IS NULL) THEN
    v_fallas := v_fallas || 'backfill incompleto de created_by_organization_id';
  END IF;

  IF (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers'
      AND (qual ILIKE '%customer_scope_matches%')
  ) <> 5 THEN
    v_fallas := v_fallas || 'customers: se esperaban 5 policies de personal acotadas por empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'customers' AND t.tgname = 'trg_customer_owner_organization'
  ) THEN
    v_fallas := v_fallas || 'trigger trg_customer_owner_organization ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'organizations' AND t.tgname = 'trg_organization_active_flag'
  ) THEN
    v_fallas := v_fallas || 'trigger trg_organization_active_flag ausente';
  END IF;

  IF has_function_privilege('anon', 'public.platform_create_organization(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.platform_create_organization(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.platform_set_organization_active(uuid, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.platform_set_organization_active(uuid, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.link_customer_to_organization_by_rfc(text, text, text, text, text)', 'EXECUTE') THEN
    v_fallas := v_fallas || 'ACL de funciones de plataforma más amplia de lo previsto';
  END IF;

  IF array_length(v_fallas, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'MULTIEMPRESA 0030: estado final inesperado:\n%',
      array_to_string(v_fallas, E'\n');
  END IF;
END;
$$;
