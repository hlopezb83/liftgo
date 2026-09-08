-- Smoke SQL · Hallazgo 7, corrección v7.421.2:
--   El trigger trg_contract_one_active_per_booking (función
--   enforce_one_active_contract_per_booking) impide CUALQUIER segundo contrato
--   no cancelado por reserva, sin importar la fecha de los existentes.
--   Corrige el hueco del índice parcial con corte created_at >= 2026-09-03,
--   que no bloqueaba contratos nuevos frente a duplicados históricos.
--   psql -f supabase/tests/r_fix40_contratos_duplicado_trigger_smoke.sql
--
-- AUTOCONTENIDO: no depende de datos productivos (antes usaba CTR-0002/CTR-0003
-- y por eso fallaba en la base limpia de CI). Crea sus propias fixtures —
-- incluidos dos "duplicados históricos" insertados con los triggers de la tabla
-- deshabilitados— y TODO corre dentro de una transacción que SIEMPRE termina en
-- ROLLBACK: no persiste ningún dato.
-- Requiere un rol dueño de las tablas (postgres) para deshabilitar triggers.

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

CREATE TEMP TABLE fx (k text PRIMARY KEY, v uuid) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- Fixtures. Se insertan con los triggers de usuario deshabilitados para saltar
-- los guards de negocio (admin obligatorio, numeración, sincronía de flota):
-- lo que se prueba aquí es únicamente el trigger de contratos duplicados, que
-- se reactiva antes de la primera aserción.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers DISABLE TRIGGER USER;
ALTER TABLE public.forklifts DISABLE TRIGGER USER;
ALTER TABLE public.bookings  DISABLE TRIGGER USER;
ALTER TABLE public.contracts DISABLE TRIGGER USER;

DO $fx$
DECLARE
  v_admin uuid;
  v_customer uuid := gen_random_uuid();
  v_forklift uuid := gen_random_uuid();
  v_hist uuid := gen_random_uuid();
  v_free uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF v_admin IS NULL THEN
    v_admin := gen_random_uuid();
    INSERT INTO auth.users (id) VALUES (v_admin);
    INSERT INTO public.user_roles (user_id, role) VALUES (v_admin, 'admin');
  END IF;
  INSERT INTO fx VALUES ('admin', v_admin), ('hist', v_hist), ('free', v_free);

  INSERT INTO public.customers (id, name) VALUES (v_customer, 'SMOKE R40 Cliente');
  INSERT INTO public.forklifts (id, name, model)
  VALUES (v_forklift, 'SMOKE R40 Montacargas', 'SMOKE-MODEL');

  INSERT INTO public.bookings (id, booking_number, forklift_id, customer_id, start_date, end_date)
  VALUES
    (v_hist, 'SMOKE-R40-BK-HIST', v_forklift, v_customer, current_date, current_date + 5),
    (v_free, 'SMOKE-R40-BK-FREE', v_forklift, v_customer, current_date + 10, current_date + 15);

  -- Duplicados "históricos": dos contratos no cancelados en la MISMA reserva,
  -- creados antes del corte del índice viejo (2026-09-03).
  INSERT INTO public.contracts (contract_number, booking_id, status, created_at)
  VALUES
    ('SMOKE-R40-HIST-A', v_hist, 'draft', timestamptz '2026-01-15 12:00:00+00'),
    ('SMOKE-R40-HIST-B', v_hist, 'draft', timestamptz '2026-01-16 12:00:00+00');
END
$fx$;

ALTER TABLE public.customers ENABLE TRIGGER USER;
ALTER TABLE public.forklifts ENABLE TRIGGER USER;
ALTER TABLE public.bookings  ENABLE TRIGGER USER;
ALTER TABLE public.contracts ENABLE TRIGGER USER;

-- Claims de admin: enforce_signed_contract_lock exige admin para transiciones
-- desde 'cancelled'; aquí probamos que el bloqueo por duplicado ocurre incluso
-- cuando el rol sí tendría permiso.
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (SELECT v::text FROM fx WHERE k = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);

DO $t$
DECLARE
  v_hist_booking uuid := (SELECT v FROM fx WHERE k = 'hist');
  v_free_booking uuid := (SELECT v FROM fx WHERE k = 'free');
  v_id_a uuid;
  v_id_b uuid;
  v_lock_seen boolean := false;
BEGIN
  -- T1: una reserva cuyos contratos no cancelados son TODOS históricos
  -- (anteriores al corte del índice viejo) bloquea un INSERT nuevo con 23505 y
  -- el nombre que reconoce la UI.
  BEGIN
    INSERT INTO public.contracts (contract_number, booking_id)
    VALUES ('SMOKE-R40-T1', v_hist_booking);
    PERFORM pg_temp.expect_true('T1 histórico bloquea INSERT nuevo', false);
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.expect_true(
      'T1 histórico bloquea INSERT nuevo (23505 contracts_one_active_per_booking)',
      SQLERRM LIKE '%contracts_one_active_per_booking%'
    );
  END;

  -- T2: primer contrato de una reserva libre entra, toma el candado advisory
  -- transaccional (serializa transacciones concurrentes por booking_id) y el
  -- segundo intento en la misma reserva queda bloqueado.
  INSERT INTO public.contracts (contract_number, booking_id)
  VALUES ('SMOKE-R40-T2A', v_free_booking) RETURNING id INTO v_id_a;

  SELECT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND pid = pg_backend_pid()
  ) INTO v_lock_seen;
  PERFORM pg_temp.expect_true('T2 candado advisory por reserva tomado', v_lock_seen);

  BEGIN
    INSERT INTO public.contracts (contract_number, booking_id)
    VALUES ('SMOKE-R40-T2B', v_free_booking);
    PERFORM pg_temp.expect_true('T2 segundo INSERT bloqueado', false);
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.expect_true(
      'T2 segundo INSERT bloqueado (23505)',
      SQLERRM LIKE '%contracts_one_active_per_booking%'
    );
  END;

  -- T3: cancelar está permitido y una reserva puede acumular varios
  -- contratos cancelados.
  UPDATE public.contracts SET status = 'cancelled' WHERE id = v_id_a;
  INSERT INTO public.contracts (contract_number, booking_id)
  VALUES ('SMOKE-R40-T3', v_free_booking) RETURNING id INTO v_id_b;
  UPDATE public.contracts SET status = 'cancelled' WHERE id = v_id_b;
  PERFORM pg_temp.expect_true(
    'T3 múltiples cancelados por reserva permitidos',
    (SELECT count(*) FROM public.contracts
     WHERE booking_id = v_free_booking AND status = 'cancelled') = 2
  );

  -- T4: reactivar (cancelled → draft) cuando ya hay otro contrato vigente en
  -- la reserva queda bloqueado.
  INSERT INTO public.contracts (contract_number, booking_id)
  VALUES ('SMOKE-R40-T4', v_free_booking);
  BEGIN
    UPDATE public.contracts SET status = 'draft' WHERE id = v_id_a;
    PERFORM pg_temp.expect_true('T4 reactivación duplicada bloqueada', false);
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.expect_true(
      'T4 reactivación duplicada bloqueada (23505)',
      SQLERRM LIKE '%contracts_one_active_per_booking%'
    );
  END;

  -- T5: cancelar uno de los duplicados históricos sigue permitido. Se ejecuta
  -- y se revierte de inmediato (savepoint implícito del bloque) para dejar los
  -- históricos exactamente como estaban.
  BEGIN
    UPDATE public.contracts SET status = 'cancelled'
    WHERE contract_number = 'SMOKE-R40-HIST-B';
    RAISE EXCEPTION 'REVERT_T5_OK';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.expect_true(
      'T5 cancelar un duplicado histórico permitido',
      SQLERRM = 'REVERT_T5_OK'
    );
  END;
END
$t$;

-- T6: los duplicados históricos permanecen intactos (misma reserva, no
-- cancelados, ni borrados ni alterados).
SELECT pg_temp.expect_true(
  'T6 duplicados históricos intactos (misma reserva, no cancelados)',
  (SELECT count(*) FROM public.contracts
   WHERE contract_number IN ('SMOKE-R40-HIST-A','SMOKE-R40-HIST-B')
     AND booking_id = (SELECT v FROM fx WHERE k = 'hist')
     AND status <> 'cancelled') = 2
);

-- T7: el índice prospectivo defectuoso ya no existe; el candado vive en el
-- trigger.
SELECT pg_temp.expect_true(
  'T7 índice con corte por fecha eliminado',
  NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contracts_one_active_per_booking')
);
SELECT pg_temp.expect_true(
  'T7 trigger trg_contract_one_active_per_booking activo',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'contracts'
      AND t.tgname = 'trg_contract_one_active_per_booking'
      AND NOT t.tgisinternal
  )
);

ROLLBACK;
