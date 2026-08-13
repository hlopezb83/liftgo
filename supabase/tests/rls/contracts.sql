-- RLS: contracts — escritura gobernada por la matriz (has_permission); mecánico sin acceso.
-- FIX-R2-04: chequeo de BREACH fuera del handler (ver invoices.sql).
BEGIN;

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
