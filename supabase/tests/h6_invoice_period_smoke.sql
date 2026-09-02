-- H-6 — Forward-only: una factura con reserva DEBE llevar billing_period_start.
-- Ejecutar manualmente:
--   psql -f supabase/tests/h6_invoice_period_smoke.sql
-- Todo corre dentro de una transacción con ROLLBACK: no deja datos.

\set ON_ERROR_STOP off

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'OK  %', p_label;
  ELSE
    RAISE WARNING 'FALLO  %', p_label;
  END IF;
END; $$;

-- ---------------------------------------------------------------------------
-- Estático: la función existe, es SECURITY INVOKER (no DEFINER), fija
-- search_path, exime a roles de backend y lanza la excepción correcta.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'H-6 enforce_invoice_booking_period existe',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_invoice_booking_period'
  )
);

SELECT pg_temp.expect_true(
  'H-6 enforce_invoice_booking_period es SECURITY INVOKER (current_user refleja el rol real)',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_invoice_booking_period'
       AND p.prosecdef = false
  )
);

SELECT pg_temp.expect_true(
  'H-6 enforce_invoice_booking_period fija search_path',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_invoice_booking_period'
       AND array_to_string(p.proconfig, ',') ILIKE '%search_path%'
  )
);

SELECT pg_temp.expect_true(
  'H-6 exime a postgres/service_role y bloquea booking sin periodo',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_invoice_booking_period'
       AND p.prosrc ILIKE '%current_user IN (''postgres'', ''service_role'')%'
       AND p.prosrc ILIKE '%billing_period_start IS NULL%'
       AND p.prosrc ILIKE '%check_violation%'
  )
);

SELECT pg_temp.expect_true(
  'H-6 trigger trg_enforce_invoice_booking_period activo en invoices',
  EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'invoices'
       AND t.tgname = 'trg_enforce_invoice_booking_period'
       AND t.tgenabled IN ('O','A')
  )
);

-- ---------------------------------------------------------------------------
-- Comportamiento (como rol authenticated con perfil admin):
--   A) reserva + periodo NULL  -> bloqueado
--   B) reserva + periodo set    -> permitido
--   C) sin reserva + periodo NULL -> permitido
-- La cadena cliente/montacargas/reserva se crea como postgres (superuser),
-- luego se cambia a authenticated solo para los inserts de factura.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_user    uuid := '12111111-0000-4000-8000-000000000006';
  v_cust    uuid := gen_random_uuid();
  v_fork    uuid := gen_random_uuid();
  v_book    uuid := gen_random_uuid();
  v_ok      boolean;
BEGIN
  -- Usuario admin + rol (para que RLS permita insertar facturas).
  INSERT INTO auth.users (id, email, created_at, updated_at)
  VALUES (v_user, 'h6.admin@test.local', now(), now()) ON CONFLICT DO NOTHING;
  -- Un trigger de auth ya puede haber creado el rol por defecto y existe un
  -- único rol por usuario: se promueve a admin en lugar de insertar otro.
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
  ON CONFLICT DO NOTHING;
  UPDATE public.user_roles SET role = 'admin' WHERE user_id = v_user;

  -- Cadena mínima como superuser (RLS y triggers de asignación se ejecutan).
  INSERT INTO public.customers (id, name) VALUES (v_cust, 'H6 Smoke SA de CV');
  INSERT INTO public.forklifts (id, name, model)
  VALUES (v_fork, 'H6-Montacargas', 'H6-Modelo');
  INSERT INTO public.bookings (id, forklift_id, start_date, end_date)
  VALUES (v_book, v_fork, public.today_mty(), public.today_mty() + 30);

  -- El guard de periodo es un trigger de tabla: aplica con cualquier rol. Se
  -- declaran las claims del operador, pero sin cambiar de rol (en CI el rol
  -- authenticated no tiene privilegios sobre la tabla).
  PERFORM set_config('request.jwt.claims',
    '{"sub":"12111111-0000-4000-8000-000000000006","role":"authenticated"}', true);

  -- Caso A: reserva SIN periodo -> debe bloquear.
  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, customer_id,
                                  booking_id, subtotal, tax_amount, total,
                                  status, issued_at, due_date,
                                  billing_period_start, billing_period_end, line_items)
    VALUES ('H6-FAC-A', 'H6 Smoke SA de CV', v_cust, v_book,
            1000, 160, 1160, 'draft', public.today_mty(), public.today_mty() + 30,
            NULL, NULL, '[{"description":"Smoke","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);
    v_ok := false;
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  PERFORM pg_temp.expect_true(
    'H-6 caso A: reserva sin periodo es bloqueada por el trigger', v_ok);

  -- Caso B: reserva CON periodo -> se permite.
  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, customer_id,
                                  booking_id, subtotal, tax_amount, total,
                                  status, issued_at, due_date,
                                  billing_period_start, billing_period_end, line_items)
    VALUES ('H6-FAC-B', 'H6 Smoke SA de CV', v_cust, v_book,
            1000, 160, 1160, 'draft', public.today_mty(), public.today_mty() + 30,
            public.today_mty(), public.today_mty() + 30, '[{"description":"Smoke","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  PERFORM pg_temp.expect_true(
    'H-6 caso B: reserva con periodo se permite', v_ok);

  -- Caso C: sin reserva (booking_id NULL) y sin periodo -> se permite.
  BEGIN
    INSERT INTO public.invoices (invoice_number, customer_name, customer_id,
                                  booking_id, subtotal, tax_amount, total,
                                  status, issued_at, due_date,
                                  billing_period_start, billing_period_end, line_items)
    VALUES ('H6-FAC-C', 'H6 Smoke SA de CV', v_cust, NULL,
            500, 80, 580, 'draft', public.today_mty(), public.today_mty() + 15,
            NULL, NULL, '[{"description":"Smoke","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  PERFORM pg_temp.expect_true(
    'H-6 caso C: factura sin reserva y sin periodo se permite', v_ok);

EXCEPTION WHEN others THEN
  RAISE WARNING 'FALLO  H-6 pruebas de comportamiento abortadas: %', SQLERRM;
END $$;

ROLLBACK;
