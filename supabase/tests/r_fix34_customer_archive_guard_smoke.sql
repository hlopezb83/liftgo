-- Smoke del guard P1 de clientes:
--   trg_guard_customer_archive / public.guard_customer_archive() impide que un
--   UPDATE directo sobre customers.deleted_at evada las reglas duras que ya
--   aplicaba public.soft_delete_customer(): sólo admin/administrativo archivan
--   y no se puede archivar con reservas activas ('confirmed','in_progress').
--   El saldo pendiente NO es regla de base de datos (sigue siendo UI).
--   Desarchivar y las ediciones normales quedan sin cambios.
--
--   psql -f supabase/tests/r_fix34_customer_archive_guard_smoke.sql
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

CREATE OR REPLACE FUNCTION pg_temp.fndef(p_name text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;

-- ---------------------------------------------------------------------------
-- 1. Contrato del guard (catálogo)
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_true(
  'existe el trigger BEFORE UPDATE trg_guard_customer_archive',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'customers'
      AND t.tgname = 'trg_guard_customer_archive'
      AND (t.tgtype & 2) <> 0   -- BEFORE
      AND (t.tgtype & 16) <> 0  -- UPDATE
  )
);

SELECT pg_temp.expect_true(
  'guard_customer_archive es SECURITY DEFINER con search_path = public',
  pg_temp.fndef('guard_customer_archive') LIKE '%SECURITY DEFINER%'
  AND pg_temp.fndef('guard_customer_archive') LIKE '%search_path%public%'
);

SELECT pg_temp.expect_true(
  'guard_customer_archive usa (select auth.uid()) y has_role',
  pg_temp.fndef('guard_customer_archive') LIKE '%select auth.uid()%'
  AND pg_temp.fndef('guard_customer_archive') LIKE '%has_role%'
);

SELECT pg_temp.expect_true(
  'guard_customer_archive respeta procesos internos y sembrado E2E',
  pg_temp.fndef('guard_customer_archive') LIKE '%app.e2e_seed%'
);

SELECT pg_temp.expect_true(
  'el guard sólo actúa en la transición no archivado -> archivado',
  pg_temp.fndef('guard_customer_archive')
    LIKE '%OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL%'
);

SELECT pg_temp.expect_true(
  'soft_delete_customer y el guard comparten customer_has_active_bookings',
  pg_temp.fndef('soft_delete_customer') LIKE '%customer_has_active_bookings%'
  AND pg_temp.fndef('guard_customer_archive') LIKE '%customer_has_active_bookings%'
);

SELECT pg_temp.expect_true(
  'la definición de reserva activa sigue siendo confirmed/in_progress',
  pg_temp.fndef('customer_has_active_bookings') LIKE '%confirmed%'
  AND pg_temp.fndef('customer_has_active_bookings') LIKE '%in_progress%'
);

SELECT pg_temp.expect_true(
  'el saldo pendiente NO es bloqueo de base de datos',
  pg_temp.fndef('guard_customer_archive') NOT LIKE '%invoices%'
  AND pg_temp.fndef('guard_customer_archive') NOT LIKE '%total_paid%'
);

-- ---------------------------------------------------------------------------
-- 2. Comportamiento por rol y estado
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
  ('44444444-0000-4000-8000-000000000001', 'admin.arch@test.local', now(), now()),
  ('44444444-0000-4000-8000-000000000002', 'administrativo.arch@test.local', now(), now()),
  ('44444444-0000-4000-8000-000000000003', 'ventas.arch@test.local', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('44444444-0000-4000-8000-000000000001', 'admin'),
  ('44444444-0000-4000-8000-000000000002', 'administrativo'),
  ('44444444-0000-4000-8000-000000000003', 'ventas')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- Cliente A: sin reservas. Cliente B: con reserva activa.
INSERT INTO public.customers (id, name) VALUES
  ('44444444-0000-4000-8000-0000000000a1', 'Cliente Archivar OK'),
  ('44444444-0000-4000-8000-0000000000b1', 'Cliente Con Renta');

INSERT INTO public.bookings (id, customer_id, customer_name, start_date, end_date, status)
VALUES ('44444444-0000-4000-8000-0000000000b9',
        '44444444-0000-4000-8000-0000000000b1', 'Cliente Con Renta',
        current_date, current_date + 5, 'confirmed');

SET LOCAL role = 'authenticated';

-- 2.1 ventas NO puede archivar por UPDATE directo (aunque la policy lo permita).
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.customers SET deleted_at = now()
   WHERE id = '44444444-0000-4000-8000-0000000000a1';
  RAISE WARNING 'FALLO  ventas pudo archivar con UPDATE directo';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OK  ventas rechazado con 42501 al archivar directo';
END $$;

-- 2.2 ventas sí puede hacer una edición normal (no se toca deleted_at).
DO $$
BEGIN
  UPDATE public.customers SET notes = 'nota de ventas'
   WHERE id = '44444444-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.expect_true(
    'edición normal de ventas no afectada',
    EXISTS (SELECT 1 FROM public.customers
             WHERE id = '44444444-0000-4000-8000-0000000000a1'
               AND notes = 'nota de ventas'));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  edición normal rechazada: %', SQLERRM;
END $$;

-- 2.3 administrativo NO puede archivar un cliente con reserva activa (directo).
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.customers SET deleted_at = now()
   WHERE id = '44444444-0000-4000-8000-0000000000b1';
  RAISE WARNING 'FALLO  UPDATE directo evadió el guard de reservas activas';
EXCEPTION WHEN raise_exception THEN
  RAISE NOTICE 'OK  UPDATE directo rechazado con P0001 por reserva activa';
END $$;

SELECT pg_temp.expect_true(
  'el cliente con reserva activa sigue sin archivar',
  EXISTS (SELECT 1 FROM public.customers
           WHERE id = '44444444-0000-4000-8000-0000000000b1' AND deleted_at IS NULL)
);

-- 2.4 el RPC mantiene su comportamiento previo (mismo rechazo).
DO $$
BEGIN
  PERFORM public.soft_delete_customer('44444444-0000-4000-8000-0000000000b1');
  RAISE WARNING 'FALLO  el RPC archivó un cliente con reserva activa';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'OK  el RPC sigue rechazando con reservas activas (%)', SQLERRM;
END $$;

-- 2.5 admin archiva un cliente elegible por UPDATE directo.
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.customers SET deleted_at = now()
   WHERE id = '44444444-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.expect_true(
    'admin archiva cliente elegible',
    EXISTS (SELECT 1 FROM public.customers
             WHERE id = '44444444-0000-4000-8000-0000000000a1' AND deleted_at IS NOT NULL));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  admin no pudo archivar cliente elegible: %', SQLERRM;
END $$;

-- 2.6 desarchivar (deleted_at -> NULL) no cambia de comportamiento.
DO $$
BEGIN
  UPDATE public.customers SET deleted_at = NULL
   WHERE id = '44444444-0000-4000-8000-0000000000a1';
  PERFORM pg_temp.expect_true(
    'desarchivar sigue permitido (sin nueva regla)',
    EXISTS (SELECT 1 FROM public.customers
             WHERE id = '44444444-0000-4000-8000-0000000000a1' AND deleted_at IS NULL));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  desarchivar rechazado: %', SQLERRM;
END $$;

-- 2.7 el RPC sigue archivando a un cliente elegible (administrativo).
SET LOCAL request.jwt.claims TO '{"sub":"44444444-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$
BEGIN
  PERFORM public.soft_delete_customer('44444444-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.expect_true(
    'el RPC archiva cliente elegible como administrativo',
    EXISTS (SELECT 1 FROM public.customers
             WHERE id = '44444444-0000-4000-8000-0000000000a1' AND deleted_at IS NOT NULL));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  el RPC no archivó cliente elegible: %', SQLERRM;
END $$;

ROLLBACK;
