-- Smoke SQL · Bug 3 endurecido en DB (v7.423.1):
--   trg_delivery_completed_evidence (función enforce_delivery_completed_evidence)
--   exige completed_no_evidence_reason cuando una entrega se da de alta ya
--   'completed' o transiciona a 'completed' SIN driver_name NI signature_base64.
--   Las filas que ya estaban completed antes de la migración no se evalúan
--   (históricos editables). Cuatro casos: firma, operador, razón y rechazo.
--   psql -f supabase/tests/r_fix41_delivery_evidence_smoke.sql
-- Requiere un rol con escritura en deliveries (las mutaciones son de prueba).
-- TODO corre dentro de una transacción que SIEMPRE termina en ROLLBACK:
-- no persiste ningún dato.

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

-- Catálogo: trigger BEFORE INSERT OR UPDATE ligado a la función correcta.
SELECT pg_temp.expect_true(
  'R41 existe trg_delivery_completed_evidence (BEFORE INSERT OR UPDATE)',
  EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'deliveries' AND t.tgname = 'trg_delivery_completed_evidence'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE INSERT OR UPDATE%'
      AND pg_get_triggerdef(t.oid) ILIKE '%enforce_delivery_completed_evidence()%'
  )
);

-- Comportamiento: los cuatro casos sobre fixtures efímeros.
DO $$
DECLARE
  v_cust uuid := gen_random_uuid();
  v_fk   uuid := gen_random_uuid();
  v_bk   uuid := gen_random_uuid();
  v_d1   uuid := gen_random_uuid();
  v_d2   uuid := gen_random_uuid();
  v_d3   uuid := gen_random_uuid();
  v_d4   uuid := gen_random_uuid();
  v_d5   uuid := gen_random_uuid();
  v_hist uuid;
  v_hist_notes text;
  v_ok   boolean;
  v_state text;
  v_msg  text;
BEGIN
  INSERT INTO public.customers (id, name) VALUES (v_cust, 'R41 Smoke SA de CV');
  INSERT INTO public.forklifts (id, name, model, status) VALUES (v_fk, 'R41-U1', 'SMOKE', 'available');
  INSERT INTO public.bookings (id, forklift_id, customer_id, customer_name, start_date, end_date, status)
  VALUES (v_bk, v_fk, v_cust, 'R41 Smoke SA de CV', public.today_mty(), public.today_mty() + 10, 'confirmed');

  -- Caso 1 · FIRMA: transición scheduled → completed con firma y sin operador.
  INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date)
  VALUES (v_d1, v_bk, v_fk, 'delivery', 'scheduled', public.today_mty());
  BEGIN
    UPDATE public.deliveries
       SET status = 'completed', signature_base64 = 'data:image/png;base64,R41'
     WHERE id = v_d1;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.expect_true('Caso 1 firma: completar con firma y sin operador pasa' || COALESCE(' (' || v_msg || ')', ''), v_ok);
  v_msg := NULL;

  -- Caso 2 · OPERADOR: transición con operador asignado, sin firma ni razón.
  INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date, driver_name)
  VALUES (v_d2, v_bk, v_fk, 'delivery', 'scheduled', public.today_mty(), 'Juan Pérez');
  BEGIN
    UPDATE public.deliveries SET status = 'completed' WHERE id = v_d2;
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.expect_true('Caso 2 operador: completar con operador y sin firma pasa' || COALESCE(' (' || v_msg || ')', ''), v_ok);
  v_msg := NULL;

  -- Caso 3 · RAZÓN: alta ya completed sin operador ni firma pero con justificación.
  BEGIN
    INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date, completed_no_evidence_reason)
    VALUES (v_d3, v_bk, v_fk, 'delivery', 'completed', public.today_mty(), 'Autorizó el supervisor por teléfono');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.expect_true('Caso 3 razón: alta completed con justificación y sin operador/firma pasa' || COALESCE(' (' || v_msg || ')', ''), v_ok);
  v_msg := NULL;

  -- Caso 4a · RECHAZO en INSERT: alta completed sin operador, sin firma, sin razón.
  v_ok := false; v_state := NULL;
  BEGIN
    INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date)
    VALUES (v_d4, v_bk, v_fk, 'delivery', 'completed', public.today_mty());
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.expect_true(
    'Caso 4a rechazo INSERT: sin operador/firma/razón falla con 23514 y mensaje en español',
    v_ok AND v_state = '23514' AND v_msg LIKE '%justificación%'
  );
  PERFORM pg_temp.expect_true(
    'Caso 4a no persiste la fila rechazada',
    NOT EXISTS (SELECT 1 FROM public.deliveries WHERE id = v_d4)
  );
  v_msg := NULL;

  -- Caso 4b · RECHAZO en transición: scheduled → completed sin ninguna evidencia.
  -- Espacios en blanco NO cuentan como evidencia ni como razón.
  INSERT INTO public.deliveries (id, booking_id, forklift_id, type, status, scheduled_date, driver_name)
  VALUES (v_d5, v_bk, v_fk, 'delivery', 'scheduled', public.today_mty(), '   ');
  v_ok := false; v_state := NULL;
  BEGIN
    UPDATE public.deliveries
       SET status = 'completed', completed_no_evidence_reason = '  '
     WHERE id = v_d5;
  EXCEPTION WHEN OTHERS THEN
    v_ok := true; v_state := SQLSTATE;
  END;
  PERFORM pg_temp.expect_true('Caso 4b rechazo transición: blancos no cuentan como evidencia (23514)', v_ok AND v_state = '23514');
  PERFORM pg_temp.expect_true(
    'Caso 4b la entrega sigue programada',
    (SELECT status FROM public.deliveries WHERE id = v_d5) = 'scheduled'
  );

  -- Históricos: una fila que YA estaba completed sin evidencia sigue editable.
  SELECT id, notes INTO v_hist, v_hist_notes
    FROM public.deliveries
   WHERE status = 'completed'
     AND NULLIF(btrim(driver_name), '') IS NULL
     AND NULLIF(btrim(signature_base64), '') IS NULL
     AND NULLIF(btrim(completed_no_evidence_reason), '') IS NULL
   ORDER BY created_at
   LIMIT 1;
  IF v_hist IS NULL THEN
    RAISE NOTICE 'SKIP histórico: no hay entregas completadas sin evidencia en esta base';
  ELSE
    BEGIN
      UPDATE public.deliveries SET notes = COALESCE(notes, '') || ' [r41]' WHERE id = v_hist;
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false; v_msg := SQLERRM;
    END;
    PERFORM pg_temp.expect_true('Histórico completed sin evidencia sigue editable (sin bloqueo)' || COALESCE(' (' || v_msg || ')', ''), v_ok);
  END IF;
END $$;

ROLLBACK;
