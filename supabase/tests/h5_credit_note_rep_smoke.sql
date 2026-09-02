-- H-5 — Tope de notas de crédito contra complementos de pago (REP) vigentes.
-- Ejecutar manualmente:
--   psql -f supabase/tests/h5_credit_note_rep_smoke.sql
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
-- Estático: el disparador considera los REP timbrados y vigentes.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_true(
  'H-5 enforce_credit_note_max descuenta pagos con REP vigente',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_credit_note_max'
       AND p.prosrc ILIKE '%rep_cfdi_status%'
       AND p.prosrc ILIKE '%rep_cancelled_at IS NULL%'
  )
);

SELECT pg_temp.expect_true(
  'H-5 enforce_credit_note_max fija search_path',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enforce_credit_note_max'
       AND array_to_string(p.proconfig, ',') ILIKE '%search_path%'
  )
);

-- ---------------------------------------------------------------------------
-- Comportamiento: PUE (sin REP) permite, PPD con REP vigente bloquea,
-- REP cancelado vuelve a permitir.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cust uuid := gen_random_uuid();
  v_inv  uuid := gen_random_uuid();
  v_pay  uuid := gen_random_uuid();
  v_ok   boolean;
BEGIN
  INSERT INTO public.customers (id, name) VALUES (v_cust, 'H5 Smoke SA de CV');

  INSERT INTO public.invoices (id, customer_id, customer_name, invoice_number,
                               subtotal, tax_amount, total, status, issued_at, due_date,
                               line_items)
  VALUES (v_inv, v_cust, 'H5 Smoke SA de CV', 'H5-FAC-001',
          1000, 160, 1160, 'sent', public.today_mty(), public.today_mty() + 30,
          '[{"description":"Smoke","quantity":1,"unit_price":1000,"amount":1000}]'::jsonb);

  -- Caso A: pago SIN REP timbrado → la NC completa se permite (saldo a favor).
  INSERT INTO public.payments (id, invoice_id, amount, payment_date, currency)
  VALUES (v_pay, v_inv, 1160, public.today_mty(), 'MXN');

  BEGIN
    INSERT INTO public.credit_notes (invoice_id, customer_id, credit_note_number, motive,
                                     reason_text, subtotal, tax_amount, total, status)
    VALUES (v_inv, v_cust, 'H5-NC-' || gen_random_uuid()::text, 'return',
            'Devolución total de la renta', 1000, 160, 1160, 'draft');
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  PERFORM pg_temp.expect_true('H-5 caso A: pago PUE sin REP no topa la NC', v_ok);

  DELETE FROM public.credit_notes WHERE invoice_id = v_inv;

  -- Caso B: el pago pasa a tener REP timbrado vigente → la NC completa falla.
  UPDATE public.payments
     SET rep_cfdi_status = 'stamped', rep_cfdi_uuid = gen_random_uuid(), rep_cancelled_at = NULL
   WHERE id = v_pay;

  BEGIN
    INSERT INTO public.credit_notes (invoice_id, customer_id, credit_note_number, motive,
                                     reason_text, subtotal, tax_amount, total, status)
    VALUES (v_inv, v_cust, 'H5-NC-' || gen_random_uuid()::text, 'return',
            'Devolución total de la renta', 1000, 160, 1160, 'draft');
    v_ok := false;
  EXCEPTION WHEN others THEN
    v_ok := true;
  END;
  PERFORM pg_temp.expect_true('H-5 caso B: REP vigente por el total bloquea la NC', v_ok);

  -- Caso C: REP cancelado → vuelve a permitirse.
  UPDATE public.payments SET rep_cancelled_at = now() WHERE id = v_pay;

  BEGIN
    INSERT INTO public.credit_notes (invoice_id, customer_id, credit_note_number, motive,
                                     reason_text, subtotal, tax_amount, total, status)
    VALUES (v_inv, v_cust, 'H5-NC-' || gen_random_uuid()::text, 'return',
            'Devolución total de la renta', 1000, 160, 1160, 'draft');
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  PERFORM pg_temp.expect_true('H-5 caso C: con el REP cancelado la NC se permite', v_ok);
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALLO  H-5 pruebas de comportamiento abortadas: %', SQLERRM;
END $$;

ROLLBACK;
