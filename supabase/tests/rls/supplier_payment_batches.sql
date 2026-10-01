-- RLS: supplier_payment_batches y supplier_payment_batch_items — lotes de pago a proveedores.
-- Estado esperado tras el endurecimiento (v7.299.0): las policies FOR ALL con TO PUBLIC
-- se dividieron en operaciones explícitas restringidas a `authenticated` y a
-- admin/administrativo. Contienen CLABE y datos bancarios: nadie más los ve.
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
  ('f3333333-3333-4333-8333-333333333301', 'admin.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333302', 'administrativo.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333303', 'auditor.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333304', 'mecanico.spb@test.local', now(), now()),
  ('f3333333-3333-4333-8333-333333333305', 'cliente.spb@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('f3333333-3333-4333-8333-333333333301', 'admin'),
  ('f3333333-3333-4333-8333-333333333302', 'administrativo'),
  ('f3333333-3333-4333-8333-333333333303', 'auditor'),
  ('f3333333-3333-4333-8333-333333333304', 'mechanic'),
  ('f3333333-3333-4333-8333-333333333305', 'customer')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.supplier_payment_batches (id, total_amount, bill_count, currency, notes) VALUES
  ('f3333333-3333-4333-8333-3333333333b1', 5000, 1, 'MXN', 'Lote RLS');

INSERT INTO public.supplier_payment_batch_items
  (id, batch_id, supplier_name, clabe, bill_number, reference, amount) VALUES
  ('f3333333-3333-4333-8333-3333333333e1', 'f3333333-3333-4333-8333-3333333333b1',
   'Proveedor RLS', '012180000000000002', 'FAC-RLS-1', 'REF-RLS-1', 5000);

-- 1) anon: los datos bancarios jamás salen sin sesión.

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
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee supplier_payment_batches';
  END IF;
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee CLABEs en supplier_payment_batch_items';
  END IF;
  RAISE NOTICE 'OK: anon sin acceso a lotes de pago';
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso a la tesorería.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333305","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee supplier_payment_batches';
  END IF;
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee CLABEs de proveedores';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a lotes de pago';
END $$;

-- 3) Mecánico y auditor: fuera del módulo financiero.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333304","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: mecanico lee supplier_payment_batches';
  END IF;
  RAISE NOTICE 'OK: mecanico sin acceso a lotes de pago';
END $$;

SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333303","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batch_items) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: auditor lee CLABEs de supplier_payment_batch_items';
  END IF;

  BEGIN
    INSERT INTO public.supplier_payment_batches (total_amount, bill_count)
    VALUES (1, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: auditor creo un lote de pago';
  END IF;
  RAISE NOTICE 'OK: auditor sin acceso a lotes de pago';
END $$;

-- 4) Administrativo conserva SELECT; el snapshot sólo se escribe por RPC.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333302","role":"authenticated"}';
DO $administrative$
DECLARE v_blocked boolean;
BEGIN
  IF (SELECT count(*) FROM public.supplier_payment_batches) < 1
     OR (SELECT count(*) FROM public.supplier_payment_batch_items) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo perdió lectura de lotes';
  END IF;
  v_blocked := false;
  BEGIN INSERT INTO public.supplier_payment_batches(total_amount, bill_count) VALUES(800, 1);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Snapshot breach: direct batch insert allowed'; END IF;
  v_blocked := false;
  BEGIN UPDATE public.supplier_payment_batch_items SET amount = 1
          WHERE batch_id = 'f3333333-3333-4333-8333-3333333333b1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Snapshot breach: persisted amount editable'; END IF;
END;
$administrative$;

-- 5) Admin cancela mediante RPC, conservando historial; no borra filas directamente.
SET LOCAL request.jwt.claims TO '{"sub":"f3333333-3333-4333-8333-333333333301","role":"authenticated"}';
DO $admin$
DECLARE v_blocked boolean;
BEGIN
  v_blocked := false;
  BEGIN DELETE FROM public.supplier_payment_batch_items
         WHERE batch_id = 'f3333333-3333-4333-8333-3333333333b1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Snapshot breach: direct item delete allowed'; END IF;
  v_blocked := false;
  BEGIN DELETE FROM public.supplier_payment_batches
         WHERE id = 'f3333333-3333-4333-8333-3333333333b1';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'History breach: direct batch delete allowed'; END IF;
END;
$admin$;

-- 6) service_role: bypass total de RLS.
RESET ROLE;
SET LOCAL role = 'service_role';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_payment_batches) < 1 THEN
    RAISE EXCEPTION 'RLS ROTA: service_role deberia ver los lotes de pago';
  END IF;
  RAISE NOTICE 'OK: service_role ve todos los lotes de pago';
END $$;

RESET ROLE;
ROLLBACK;
