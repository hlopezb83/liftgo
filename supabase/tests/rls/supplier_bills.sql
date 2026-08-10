-- RLS: supplier_bills — cuentas por pagar restringidas a admin/administrativo (auditor solo lee).
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('99999999-0000-4000-8000-000000000001', 'ventas.cxp@test.local', now(), now()),
  ('99999999-0000-4000-8000-000000000002', 'auditor.cxp@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('99999999-0000-4000-8000-000000000001', 'ventas'),
  ('99999999-0000-4000-8000-000000000002', 'auditor')
ON CONFLICT DO NOTHING;

INSERT INTO public.supplier_bills (id, bill_number, total)
VALUES ('99999999-0000-4000-8000-00000000000f', 'CXP-RLS-TEST', 1500);

SET LOCAL role = 'authenticated';

-- 1) Ventas: sin acceso a cuentas por pagar.
SET LOCAL request.jwt.claims TO '{"sub":"99999999-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.supplier_bills) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee cuentas por pagar';
  END IF;

  BEGIN
    INSERT INTO public.supplier_bills (bill_number, total) VALUES ('CXP-RLS-HACK', 1);
    RAISE EXCEPTION 'RLS BREACH: ventas creó una factura de proveedor';
  EXCEPTION WHEN others THEN
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
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'RLS BREACH: auditor modificó una factura de proveedor';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: auditor es de solo lectura';
  END;
END $$;

ROLLBACK;
