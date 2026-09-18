-- RLS: invoices — ventas y mecánico NO acceden a facturación; dispatcher solo lee.
-- FIX-R2-04: chequeo de BREACH fuera del EXCEPTION handler; el handler solo
-- atrapa la denegación esperada (insufficient_privilege). Antes, WHEN others
-- tragaba el propio RAISE 'RLS BREACH' y la suite pasaba con la política rota.
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
  ('11111111-0000-4000-8000-000000000001', 'ventas.inv@test.local', now(), now()),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher.inv@test.local', now(), now()),
  ('11111111-0000-4000-8000-000000000003', 'auditor.inv@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001', 'ventas'),
  ('11111111-0000-4000-8000-000000000002', 'dispatcher'),
  ('11111111-0000-4000-8000-000000000003', 'auditor')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.invoices (id, invoice_number, customer_name, subtotal, tax_amount, total)
VALUES ('11111111-0000-4000-8000-00000000000f', 'FAC-RLS-TEST', 'Cliente RLS', 1000, 0, 1000);


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

-- 1) Ventas: sin acceso de lectura ni escritura.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee invoices';
  END IF;

  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, subtotal, tax_amount, total)
    VALUES ('FAC-RLS-HACK', 'Hacker', 1, 0, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  -- Fuera del handler: ningún EXCEPTION puede tragar este RAISE.
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: ventas pudo insertar invoices';
  END IF;
  RAISE NOTICE 'OK: ventas no inserta invoices';
END $$;

-- 2) Dispatcher: desde v7.325.0 (matriz de roles) NO accede a facturación.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher lee invoices';
  END IF;

  BEGIN
    UPDATE public.invoices SET total = 0
     WHERE id = '11111111-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0; -- denegación esperada
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: dispatcher pudo actualizar invoices';
  END IF;
  RAISE NOTICE 'OK: dispatcher no lee ni actualiza invoices';
END $$;

-- 3) Auditor: solo lectura.
SET LOCAL request.jwt.claims TO '{"sub":"11111111-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE v_rows int;
BEGIN
  IF (SELECT COUNT(*) FROM public.invoices
       WHERE id = '11111111-0000-4000-8000-00000000000f') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer invoices';
  END IF;

  BEGIN
    UPDATE public.invoices SET total = 0
     WHERE id = '11111111-0000-4000-8000-00000000000f';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor pudo actualizar invoices';
  END IF;
  RAISE NOTICE 'OK: auditor solo lee invoices';
END $$;

ROLLBACK;
