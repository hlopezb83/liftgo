-- RLS: audit_logs — bitácora inmutable y de lectura restringida.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('66666666-0000-4000-8000-000000000001', 'ventas.audit@test.local', now(), now()),
  ('66666666-0000-4000-8000-000000000002', 'auditor.audit@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-0000-4000-8000-000000000001', 'ventas'),
  ('66666666-0000-4000-8000-000000000002', 'auditor')
ON CONFLICT DO NOTHING;

INSERT INTO public.audit_logs (id, table_name, record_id, action) VALUES
  ('66666666-0000-4000-8000-00000000000a', 'invoices', gen_random_uuid(), 'UPDATE'),
  ('66666666-0000-4000-8000-00000000000b', 'prospects', gen_random_uuid(), 'INSERT');

SET LOCAL role = 'authenticated';

-- 1) Ventas solo ve la bitácora de prospects.
SET LOCAL request.jwt.claims TO '{"sub":"66666666-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_logs WHERE table_name = 'invoices') THEN
    RAISE EXCEPTION 'RLS BREACH: ventas ve bitácora de facturación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE table_name = 'prospects') THEN
    RAISE EXCEPTION 'RLS ROTA: ventas deberia ver bitácora de prospects';
  END IF;
END $$;

-- 2) Auditor lee todo pero NO puede alterar la bitácora (inmutabilidad).
SET LOCAL request.jwt.claims TO '{"sub":"66666666-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.audit_logs) < 2 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor no lee toda la bitácora';
  END IF;

  BEGIN
    UPDATE public.audit_logs SET action = 'TAMPERED'
     WHERE id = '66666666-0000-4000-8000-00000000000a';
    IF EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'TAMPERED') THEN
      RAISE EXCEPTION 'BREACH: la bitácora es modificable';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: audit_logs inmutable ante UPDATE';
  END;

  BEGIN
    DELETE FROM public.audit_logs WHERE id = '66666666-0000-4000-8000-00000000000a';
    IF NOT EXISTS (SELECT 1 FROM public.audit_logs
                    WHERE id = '66666666-0000-4000-8000-00000000000a') THEN
      RAISE EXCEPTION 'BREACH: la bitácora es borrable';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK: audit_logs inmutable ante DELETE';
  END;
END $$;

ROLLBACK;
