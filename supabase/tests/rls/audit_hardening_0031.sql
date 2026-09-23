-- RLS: cierre de la auditoría multiempresa (migración 0031, tramo 10).
--
-- Cubre:
--   1. Clientes: una cuenta de PORTAL con rol administrativo residual y un
--      usuario autenticado SIN membresía no ven, ni archivan, los clientes
--      internos de ninguna empresa.
--   2. organization_document_counters: RLS habilitada, sin policies y sin
--      grants para anon/authenticated (sólo service_role).
--   3. Plataforma: el admin de una empresa no puede crear ni suspender
--      empresas si no fue designado operador explícitamente, y no quedan
--      operadores sembrados automáticamente por 0030.
--   4. Alta en dos tiempos: la empresa nace inactiva y sólo se activa al
--      adjuntar a su primer administrador.
BEGIN;

SELECT set_config('app.organization_id', '32000000-0000-4000-8000-00000000000a', true);

INSERT INTO public.organizations (id, name, slug) VALUES
  ('32000000-0000-4000-8000-00000000000a', 'Org A 0031 audit', 'org-a-0031-audit');

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('32000000-0000-4000-8000-000000000001', 'admin-a@a0031.test', now(), now()),
  ('32000000-0000-4000-8000-000000000002', 'portal-admin@a0031.test', now(), now()),
  ('32000000-0000-4000-8000-000000000003', 'sin-membresia@a0031.test', now(), now()),
  ('32000000-0000-4000-8000-000000000004', 'primer-admin@a0031.test', now(), now()),
  ('32000000-0000-4000-8000-000000000005', 'operador@a0031.test', now(), now())
ON CONFLICT DO NOTHING;

-- El portal conserva un rol administrativo RESIDUAL a propósito.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('32000000-0000-4000-8000-000000000001', 'admin'),
  ('32000000-0000-4000-8000-000000000002', 'admin'),
  ('32000000-0000-4000-8000-000000000003', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type) VALUES
  ('32000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000001', 'internal'),
  ('32000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-000000000002', 'portal');

INSERT INTO public.customers (id, name, created_by_organization_id) VALUES
  ('32000000-0000-4000-8000-0000000000c1', 'Cliente interno 0031',
   '32000000-0000-4000-8000-00000000000a');
INSERT INTO public.organization_customers (organization_id, customer_id) VALUES
  ('32000000-0000-4000-8000-00000000000a', '32000000-0000-4000-8000-0000000000c1');

INSERT INTO public.customer_portal_accounts
  (organization_id, customer_id, auth_user_id, email, status)
VALUES (
  '32000000-0000-4000-8000-00000000000a',
  '32000000-0000-4000-8000-0000000000c1',
  '32000000-0000-4000-8000-000000000002',
  'portal-admin@a0031.test',
  'active'
);

-- ── 0. Guard positivo: el staff interno sí ve y archiva ──────────────
RESET request.jwt.claims;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims TO '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT set_config('app.organization_id', '32000000-0000-4000-8000-00000000000a', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = '32000000-0000-4000-8000-0000000000c1'
  ) THEN
    RAISE EXCEPTION 'RLS ROTA: el staff interno no ve a su propio cliente';
  END IF;
  IF NOT public.customer_scope_matches(
       '32000000-0000-4000-8000-0000000000c1',
       '32000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS ROTA: customer_scope_matches niega al staff interno';
  END IF;
END $$;

-- ── 1. Portal con rol admin residual: fuera del alcance interno ──────
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO '{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT set_config('app.organization_id', '32000000-0000-4000-8000-00000000000a', true);

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  IF public.current_internal_organization_id() IS NOT NULL THEN
    RAISE EXCEPTION 'RLS BREACH: una cuenta de portal resuelve organización interna';
  END IF;
  IF public.customer_scope_matches(
       '32000000-0000-4000-8000-0000000000c1',
       '32000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: el portal con rol residual entra al alcance interno';
  END IF;

  BEGIN
    PERFORM public.soft_delete_customer('32000000-0000-4000-8000-0000000000c1');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: el portal con rol residual archivó un cliente';
  END IF;
END $$;

-- ── 2. Usuario autenticado SIN membresía: falla cerrado ──────────────
RESET request.jwt.claims;
SET LOCAL request.jwt.claims TO '{"sub":"32000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT set_config('app.organization_id', '', true);

DO $$
DECLARE
  v_blocked boolean := false;
BEGIN
  IF public.organization_scope_matches('32000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: sin membresía se concede alcance por "una sola empresa"';
  END IF;
  IF public.customer_scope_matches(
       '32000000-0000-4000-8000-0000000000c1',
       '32000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'RLS BREACH: sin membresía se alcanza el conjunto de clientes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customers WHERE id = '32000000-0000-4000-8000-0000000000c1'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: sin membresía se listan clientes de una empresa';
  END IF;

  BEGIN
    PERFORM public.soft_delete_customer('32000000-0000-4000-8000-0000000000c1');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: sin membresía se archivó un cliente';
  END IF;
END $$;

-- ── 3. Ningún dato ajeno cambió ──────────────────────────────────────
RESET ROLE;
RESET request.jwt.claims;
SELECT set_config('app.organization_id', '', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = '32000000-0000-4000-8000-0000000000c1' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: el cliente quedó archivado por una sesión no autorizada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_customers
    WHERE customer_id = '32000000-0000-4000-8000-0000000000c1' AND status = 'archived'
  ) THEN
    RAISE EXCEPTION 'RLS BREACH: la relación quedó archivada por una sesión no autorizada';
  END IF;
END $$;

-- ── 4. organization_document_counters: deny-all + ACL ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'organization_document_counters'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: organization_document_counters sin RLS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_document_counters'
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: organization_document_counters no debe tener policies';
  END IF;
  IF has_table_privilege('authenticated', 'public.organization_document_counters', 'SELECT')
     OR has_table_privilege('authenticated', 'public.organization_document_counters', 'INSERT')
     OR has_table_privilege('anon', 'public.organization_document_counters', 'SELECT') THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: ACL indebida en organization_document_counters';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.organization_document_counters', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.organization_document_counters', 'UPDATE') THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: service_role perdió el acceso a los folios';
  END IF;
END $$;

-- ── 5. Autoridad de plataforma explícita ─────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_operators
    WHERE notes = 'Respaldo inicial 0030: administrador interno de la organización fundadora'
  ) THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: quedan operadores sembrados por 0030';
  END IF;
  IF has_function_privilege('authenticated',
       'public.platform_create_organization(uuid, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.platform_grant_operator(uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REGRESIÓN 0031: ACL de plataforma abierta a authenticated';
  END IF;
END $$;

-- El admin de una empresa, sin designación explícita, no es operador.
SET LOCAL role = 'service_role';

DO $$
DECLARE
  v_blocked boolean := false;
  v_org uuid;
BEGIN
  BEGIN
    PERFORM public.platform_create_organization(
      '32000000-0000-4000-8000-000000000001', 'Intento tenant', 'intento-tenant-0031');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'PRIVILEGIO BREACH: un admin de empresa creó otra empresa';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.platform_set_organization_active(
      '32000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-00000000000a', false);
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'PRIVILEGIO BREACH: un admin de empresa suspendió una empresa';
  END IF;

  -- ── 6. Alta en dos tiempos con un operador explícito ───────────────
  INSERT INTO public.platform_operators (auth_user_id, notes)
  VALUES ('32000000-0000-4000-8000-000000000005', 'Asignación explícita de prueba')
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- 0055 difiere el perfil si auth.users no trae app_metadata de empresa.
  INSERT INTO public.profiles (user_id, full_name, is_active)
  VALUES ('32000000-0000-4000-8000-000000000005', 'Operador de prueba', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;

  v_org := public.platform_create_organization(
    '32000000-0000-4000-8000-000000000005', 'Empresa Pendiente', 'empresa-pendiente-0031');

  IF (SELECT is_active FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'ALTA INCOMPLETA: la empresa nace activa sin primer administrador';
  END IF;

  -- Fallo entre pasos: el usuario no existe, la empresa sigue inactiva.
  v_blocked := false;
  BEGIN
    PERFORM public.platform_attach_first_admin(
      '32000000-0000-4000-8000-000000000005', v_org,
      '32000000-0000-4000-8000-0000000000ee');
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ALTA INCOMPLETA: se adjuntó un usuario inexistente';
  END IF;
  IF (SELECT is_active FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'ALTA INCOMPLETA: la empresa se activó tras un fallo';
  END IF;

  PERFORM public.platform_attach_first_admin(
    '32000000-0000-4000-8000-000000000005', v_org,
    '32000000-0000-4000-8000-000000000004');

  IF NOT (SELECT is_active FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'ALTA ROTA: la empresa no se activó con su primer administrador';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = v_org
      AND auth_user_id = '32000000-0000-4000-8000-000000000004'
      AND member_type = 'internal'
  ) THEN
    RAISE EXCEPTION 'ALTA ROTA: no quedó la membresía interna del primer administrador';
  END IF;
END $$;

RESET ROLE;

ROLLBACK;
