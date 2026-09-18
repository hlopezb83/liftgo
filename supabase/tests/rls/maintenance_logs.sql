-- RLS: maintenance_logs — el acceso se decide por la matriz role_permissions
-- ("Mantenimiento"): mecánico y administrativo full, auditor read, ventas y
-- dispatcher none. El cliente del portal y anon no ven órdenes de trabajo.
BEGIN;

-- Contexto multiempresa (migración 0031): las operaciones de servicio deben
-- declarar la organización antes de sembrar datos.
DO $ctx$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'SETUP: se requiere la organización inicial';
  END IF;

  PERFORM set_config('app.organization_id', v_org::text, true);
END $ctx$;


INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('a0000003-0000-4000-8000-000000000001', 'mecanico.ml@test.local', now(), now()),
  ('a0000003-0000-4000-8000-000000000002', 'ventas.ml@test.local', now(), now()),
  ('a0000003-0000-4000-8000-000000000003', 'auditor.ml@test.local', now(), now()),
  ('a0000003-0000-4000-8000-000000000004', 'cliente.ml@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000003-0000-4000-8000-000000000001', 'mechanic'),
  ('a0000003-0000-4000-8000-000000000002', 'ventas'),
  ('a0000003-0000-4000-8000-000000000003', 'auditor'),
  ('a0000003-0000-4000-8000-000000000004', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.forklifts (id, name, model) VALUES
  ('a0000003-0000-4000-8000-0000000000f1', 'MC-ML-1', 'Modelo ML');

INSERT INTO public.maintenance_logs (id, forklift_id, service_type, description) VALUES
  ('a0000003-0000-4000-8000-0000000000d1', 'a0000003-0000-4000-8000-0000000000f1',
   'preventivo', 'Servicio RLS');

-- 1) anon: sin acceso.

-- Contexto multiempresa (migración 0031): el personal interno sólo tiene
-- contexto de organización con una membresía interna explícita.
DO $mem$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE is_active
  ORDER BY created_at
  LIMIT 1;

  PERFORM set_config('app.organization_id', v_org::text, true);

  INSERT INTO public.organization_memberships (organization_id, auth_user_id, member_type)
  SELECT v_org, ur.user_id, 'internal'
  FROM public.user_roles ur
  WHERE ur.role <> 'customer'
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.auth_user_id = ur.user_id
    )
  ON CONFLICT DO NOTHING;
END $mem$;

SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee maintenance_logs';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: el historial interno de taller no se expone.
SET LOCAL request.jwt.claims TO '{"sub":"a0000003-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee maintenance_logs';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a mantenimiento';
END $$;

-- 3) Ventas: la matriz dice "none" para Mantenimiento.
SET LOCAL request.jwt.claims TO '{"sub":"a0000003-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_logs) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee maintenance_logs pese a la matriz "none"';
  END IF;

  BEGIN
    INSERT INTO public.maintenance_logs (forklift_id, service_type)
    VALUES ('a0000003-0000-4000-8000-0000000000f1', 'correctivo');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo crear una orden de trabajo';
  END IF;
  RAISE NOTICE 'OK: ventas sin acceso a maintenance_logs';
END $$;

-- 4) Auditor: matriz "read" — lee pero no escribe.
SET LOCAL request.jwt.claims TO '{"sub":"a0000003-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_logs) <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer maintenance_logs';
  END IF;

  BEGIN
    UPDATE public.maintenance_logs SET description = 'hack'
     WHERE forklift_id = 'a0000003-0000-4000-8000-0000000000f1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor pudo modificar una orden de trabajo';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura en maintenance_logs';
END $$;

-- 5) Mecánico: acceso completo (es su módulo).
SET LOCAL request.jwt.claims TO '{"sub":"a0000003-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.maintenance_logs) <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia leer maintenance_logs';
  END IF;

  INSERT INTO public.maintenance_logs (forklift_id, service_type, description)
  VALUES ('a0000003-0000-4000-8000-0000000000f1', 'correctivo', 'Alta por mecanico');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: mecanico deberia poder crear ordenes de trabajo';
  END IF;
  RAISE NOTICE 'OK: mecanico administra maintenance_logs';
END $$;

ROLLBACK;
