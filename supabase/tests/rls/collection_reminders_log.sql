-- RLS: collection_reminders_log — bitácora de recordatorios de cobranza enviados.
-- Solo lectura para admin/administrativo/auditor; NADIE escribe desde el cliente
-- (el envío lo hace la edge function con service_role). Cliente y anon sin acceso.
BEGIN;

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('c1000007-0000-4000-8000-000000000001', 'administrativo.crl@test.local', now(), now()),
  ('c1000007-0000-4000-8000-000000000002', 'auditor.crl@test.local', now(), now()),
  ('c1000007-0000-4000-8000-000000000003', 'ventas.crl@test.local', now(), now()),
  ('c1000007-0000-4000-8000-000000000004', 'cliente.crl@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('c1000007-0000-4000-8000-000000000001', 'administrativo'),
  ('c1000007-0000-4000-8000-000000000002', 'auditor'),
  ('c1000007-0000-4000-8000-000000000003', 'ventas'),
  ('c1000007-0000-4000-8000-000000000004', 'customer')
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (id, name, user_id) VALUES
  ('c1000007-0000-4000-8000-0000000000c1', 'Cliente CRL', 'c1000007-0000-4000-8000-000000000004');

INSERT INTO public.invoices (id, invoice_number, customer_id, customer_name, total) VALUES
  ('c1000007-0000-4000-8000-0000000000i1', 'FAC-CRL-1',
   'c1000007-0000-4000-8000-0000000000c1', 'Cliente CRL', 500);

INSERT INTO public.collection_reminders_log (id, invoice_id, reminder_type, recipient_email) VALUES
  ('c1000007-0000-4000-8000-0000000000a1', 'c1000007-0000-4000-8000-0000000000i1',
   'vencida', 'cobranza@test.local');

-- 1) anon: sin acceso (los correos de contacto no se filtran).
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims TO '{"role":"anon"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_reminders_log) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: anon lee collection_reminders_log';
  END IF;
END $$;

RESET ROLE;
SET LOCAL role = 'authenticated';

-- 2) Cliente del portal: sin acceso a la bitácora de cobranza.
SET LOCAL request.jwt.claims TO '{"sub":"c1000007-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_reminders_log) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: cliente del portal lee collection_reminders_log';
  END IF;
  RAISE NOTICE 'OK: cliente del portal sin acceso a collection_reminders_log';
END $$;

-- 3) Ventas: sin acceso.
SET LOCAL request.jwt.claims TO '{"sub":"c1000007-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_reminders_log) <> 0 THEN
    RAISE EXCEPTION 'RLS BREACH: ventas lee collection_reminders_log';
  END IF;
  RAISE NOTICE 'OK: ventas sin acceso a collection_reminders_log';
END $$;

-- 4) Administrativo: lee, pero NO puede fabricar evidencia de envío.
SET LOCAL request.jwt.claims TO '{"sub":"c1000007-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE v_rows int; v_blocked boolean := false;
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_reminders_log
       WHERE id = 'c1000007-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: administrativo deberia leer collection_reminders_log';
  END IF;

  BEGIN
    INSERT INTO public.collection_reminders_log (invoice_id, reminder_type, recipient_email)
    VALUES ('c1000007-0000-4000-8000-0000000000i1', 'falso', 'hack@test.local');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'RLS BREACH: administrativo fabrico un registro de recordatorio';
  END IF;

  BEGIN
    DELETE FROM public.collection_reminders_log
     WHERE id = 'c1000007-0000-4000-8000-0000000000a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_rows := 0;
  END;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'RLS BREACH: administrativo borro la bitacora de recordatorios';
  END IF;
  RAISE NOTICE 'OK: la bitacora de recordatorios es inmutable desde el cliente';
END $$;

-- 5) Auditor: lectura garantizada (necesita la evidencia).
SET LOCAL request.jwt.claims TO '{"sub":"c1000007-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.collection_reminders_log
       WHERE id = 'c1000007-0000-4000-8000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'RLS ROTA: auditor deberia leer collection_reminders_log';
  END IF;
  RAISE NOTICE 'OK: auditor lee collection_reminders_log';
END $$;

-- 6) service_role: el proceso de envío sí registra (bypass de RLS).
RESET ROLE;
SET LOCAL role = 'service_role';
SET LOCAL request.jwt.claims TO '{"role":"service_role"}';

DO $$
DECLARE v_rows int;
BEGIN
  INSERT INTO public.collection_reminders_log (invoice_id, reminder_type, recipient_email)
  VALUES ('c1000007-0000-4000-8000-0000000000i1', 'proxima', 'cobranza@test.local');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ROTO: service_role deberia poder registrar recordatorios';
  END IF;
  RAISE NOTICE 'OK: service_role registra recordatorios';
END $$;

ROLLBACK;
