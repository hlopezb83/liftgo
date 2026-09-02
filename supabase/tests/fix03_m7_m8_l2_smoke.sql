-- fix-03 — M-7 (entregas), M-8 (cotización convertida), L-2 (bitácora sin fantasmas).
-- Ejecutar manualmente:
--   psql -f supabase/tests/fix03_m7_m8_l2_smoke.sql
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
-- Estático
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'M-7 existe el guard de entrega completada',
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = 'deliveries' AND t.tgname = 'trg_guard_delivery_completed_terminal')
);

SELECT pg_temp.expect_true(
  'M-7 existe el trigger de efectos al completar',
  EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = 'deliveries' AND t.tgname = 'trg_delivery_completed_effects')
);

SELECT pg_temp.expect_true(
  'M-7 el efecto se limita a type = delivery',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'apply_delivery_completed_effects'
             AND p.prosrc ILIKE '%NEW.type <> ''delivery''%')
);

SELECT pg_temp.expect_true(
  'M-8 el dominio de estatus de cotización incluye converted',
  pg_get_constraintdef(c.oid) ILIKE '%converted%'
) FROM pg_constraint c WHERE c.conname = 'quotes_status_dominio';

SELECT pg_temp.expect_true(
  'M-8 convert_quote_to_bookings marca la cotización',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'convert_quote_to_bookings'
             AND p.prosrc ILIKE '%status = ''converted''%')
);

SELECT pg_temp.expect_true(
  'L-2 delete_quote_with_unassign revisa ROW_COUNT antes de registrar',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'delete_quote_with_unassign'
             AND p.prosrc ILIKE '%GET DIAGNOSTICS%ROW_COUNT%')
);

SELECT pg_temp.expect_true(
  'L-4 register_supplier_payment usa today_mty como respaldo',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment'
             AND p.prosrc ILIKE '%COALESCE(p_payment_date, public.today_mty())%')
);

-- ---------------------------------------------------------------------------
-- Comportamiento: entrega vs recolección y candado de reapertura.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cust uuid := gen_random_uuid();
  v_fk   uuid := gen_random_uuid();
  v_fk2  uuid := gen_random_uuid();
  v_bk   uuid := gen_random_uuid();
  v_bk2  uuid := gen_random_uuid();
  v_del  uuid := gen_random_uuid();
  v_pick uuid := gen_random_uuid();
  v_status text;
  v_status_prev text;
  v_logs int;
  v_ok boolean;
BEGIN
  INSERT INTO public.customers (id, name) VALUES (v_cust, 'FIX03 Smoke SA de CV');
  INSERT INTO public.forklifts (id, name, model, status) VALUES (v_fk, 'FIX03-U1', 'SMOKE', 'available');
  INSERT INTO public.forklifts (id, name, model, status) VALUES (v_fk2, 'FIX03-U2', 'SMOKE', 'available');
  INSERT INTO public.bookings (id, forklift_id, customer_id, customer_name, start_date, end_date, status)
  VALUES (v_bk, v_fk, v_cust, 'FIX03 Smoke SA de CV', public.today_mty(), public.today_mty() + 10, 'confirmed');

  -- Caso A: entrega completada → unidad rentada + bitácora.
  INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date)
  VALUES (v_del, v_bk, v_fk, 'delivery', 'scheduled', public.today_mty());
  UPDATE public.deliveries SET status = 'completed' WHERE id = v_del;

  SELECT status INTO v_status FROM public.forklifts WHERE id = v_fk;
  RAISE NOTICE '%', CASE WHEN v_status = 'rented'
    THEN 'OK  M-7 entrega completada deja la unidad rentada'
    ELSE 'FALLO  M-7 unidad quedó en ' || v_status END;

  SELECT count(*) INTO v_logs FROM public.status_logs
   WHERE forklift_id = v_fk AND to_status = 'rented';
  RAISE NOTICE '%', CASE WHEN v_logs = 1
    THEN 'OK  M-7 registra un movimiento en la bitácora'
    ELSE 'FALLO  M-7 movimientos en bitácora: ' || v_logs END;

  -- Caso B: recolección completada NO marca la unidad como rentada.
  -- La entrega debe apuntar al montacargas de su propia reserva (guard vigente).
  INSERT INTO public.bookings (id, forklift_id, customer_id, customer_name, start_date, end_date, status)
  VALUES (v_bk2, v_fk2, v_cust, 'FIX03 Smoke SA de CV', public.today_mty(), public.today_mty() + 10, 'confirmed');
  INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date)
  VALUES (v_pick, v_bk2, v_fk2, 'pickup', 'scheduled', public.today_mty());
  SELECT status INTO v_status_prev FROM public.forklifts WHERE id = v_fk2;
  UPDATE public.deliveries SET status = 'completed' WHERE id = v_pick;

  SELECT status INTO v_status FROM public.forklifts WHERE id = v_fk2;
  RAISE NOTICE '%', CASE WHEN v_status = v_status_prev
    THEN 'OK  M-7 una recolección no cambia el estatus de la unidad'
    ELSE 'FALLO  M-7 recolección movió la unidad de ' || v_status_prev || ' a ' || v_status END;

  -- Caso C: reabrir una entrega completada está bloqueado.
  v_ok := true;
  BEGIN
    UPDATE public.deliveries SET status = 'scheduled' WHERE id = v_del;
    v_ok := false;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
  END;
  RAISE NOTICE '%', CASE WHEN v_ok
    THEN 'OK  M-7 no se puede reabrir una entrega completada'
    ELSE 'FALLO  M-7 se permitió reabrir la entrega' END;
END $$;

ROLLBACK;
