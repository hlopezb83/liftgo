-- RLS: contracts — escritura gobernada por la matriz (has_permission); mecánico sin acceso.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
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
  ('bbbbbbbb-0000-4000-8000-000000000001', 'dispatcher.ctr@test.local', now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'mecanico.ctr@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'dispatcher'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'mechanic')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.contracts (id, contract_number)
VALUES ('bbbbbbbb-0000-4000-8000-00000000000f', 'CTR-RLS-TEST');


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

SET LOCAL role = 'authenticated';

-- 1) Dispatcher: lectura sí; escritura solo si la matriz le otorga 'full'.
SET LOCAL request.jwt.claims TO '{"sub":"bbbbbbbb-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contracts
                  WHERE id = 'bbbbbbbb-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS ROTA: dispatcher no lee contratos';
  END IF;

  IF NOT public.has_permission('Contratos', 'full') THEN
    BEGIN
      INSERT INTO public.contracts (contract_number) VALUES ('CTR-RLS-HACK');
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'RLS BREACH: dispatcher sin permiso creó un contrato';
    END IF;
    RAISE NOTICE 'OK: escritura de contratos gobernada por la matriz';
  END IF;
END $$;

-- 2) Mecánico: sin acceso a contratos.
SET LOCAL request.jwt.claims TO '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.contracts) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecánico lee contratos';
  END IF;
END $$;

ROLLBACK;
