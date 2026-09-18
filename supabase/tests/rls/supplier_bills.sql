-- RLS: supplier_bills — cuentas por pagar restringidas a admin/administrativo (auditor solo lee).
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
  ('99999999-0000-4000-8000-000000000001', 'ventas.cxp@test.local', now(), now()),
  ('99999999-0000-4000-8000-000000000002', 'auditor.cxp@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('99999999-0000-4000-8000-000000000001', 'ventas'),
  ('99999999-0000-4000-8000-000000000002', 'auditor')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.supplier_bills (id, bill_number, total)
VALUES ('99999999-0000-4000-8000-00000000000f', 'CXP-RLS-TEST', 1500);


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

-- 1) Ventas: sin acceso a cuentas por pagar.
SET LOCAL request.jwt.claims TO '{"sub":"99999999-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_bills) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee cuentas por pagar';
  END IF;

  DECLARE v_blocked boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.supplier_bills (bill_number, total) VALUES ('CXP-RLS-HACK', 1);
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'RLS BREACH: ventas creó una factura de proveedor';
    END IF;
    RAISE NOTICE 'OK: ventas bloqueado en supplier_bills';
  END;
END $$;

-- 2) Auditor: lectura sí, escritura no.
SET LOCAL request.jwt.claims TO '{"sub":"99999999-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supplier_bills
                  WHERE id = '99999999-0000-4000-8000-00000000000f') THEN
    RAISE EXCEPTION 'RLS ROTA: auditor no lee supplier_bills';
  END IF;

  BEGIN
    UPDATE public.supplier_bills SET total = 0
     WHERE id = '99999999-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0; -- denegación esperada
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor modificó una factura de proveedor';
  END IF;
  RAISE NOTICE 'OK: auditor es de solo lectura';
END $$;

ROLLBACK;
