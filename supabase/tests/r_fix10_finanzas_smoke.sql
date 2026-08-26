-- Smoke SQL de fix-10:
--   N-3  bypass de app.cxp_recalc en validate_transition (supplier_bills)
--   N-1  'paid' exige al menos un pago real
--   N-21 criterio unificado de notas de credito (cfdi_status timbrado y vigente)
--   N-33 tipo_cambio inmutable solo con CFDI o REP timbrado
--   N-2  validacion de cliente solo al salir de borrador
--   psql -f supabase/tests/r_fix10_finanzas_smoke.sql
-- Solo lecturas + un escenario transaccional que se revierte al final.

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
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name
  LIMIT 1;
$$;

-- 1) N-3: validate_transition honra el bypass de recalculo de CxP.
SELECT pg_temp.expect_true(
  'N-3 validate_transition respeta app.cxp_recalc en supplier_bills',
  pg_temp.fndef('validate_transition') ILIKE '%app.cxp_recalc%'
);

-- 2) N-1: la sincronizacion exige un pago real para marcar 'paid'.
SELECT pg_temp.expect_true(
  'N-1 sync_invoice_status_from_payments exige v_paid > 0 para paid',
  pg_temp.fndef('sync_invoice_status_from_payments') ILIKE '%AND v_paid > 0%'
);

-- 3) N-21: ambos guards usan el criterio de la UI.
SELECT pg_temp.expect_true(
  'N-21 sync_invoice_status_from_payments usa cfdi_status/cancellation_status',
  pg_temp.fndef('sync_invoice_status_from_payments') ILIKE '%cancellation_status IS DISTINCT FROM ''accepted''%'
);
SELECT pg_temp.expect_true(
  'N-21 enforce_payment_within_invoice_total usa cfdi_status/cancellation_status',
  pg_temp.fndef('enforce_payment_within_invoice_total') ILIKE '%cancellation_status IS DISTINCT FROM ''accepted''%'
);

-- 4) N-33: el candado de tipo de cambio mira el REP timbrado.
SELECT pg_temp.expect_true(
  'N-33 trg_invoice_tipo_cambio_inmutable filtra rep_cfdi_status = stamped',
  pg_temp.fndef('trg_invoice_tipo_cambio_inmutable') ILIKE '%rep_cfdi_status = ''stamped''%'
);

-- 5) N-2: la validacion de cliente solo corre al salir de borrador.
SELECT pg_temp.expect_true(
  'N-2 enforce_invoice_customer_when_not_draft solo valida la salida de draft',
  pg_temp.fndef('enforce_invoice_customer_when_not_draft') ILIKE '%OLD.status IS DISTINCT FROM ''draft''%'
);

-- 6) N-3 funcional: factura de proveedor pagada con dos pagos; al borrar uno
--    el recalculo debe bajarla a 'partial' sin excepcion de transicion.
DO $$
DECLARE
  v_supplier uuid;
  v_bill     uuid;
  v_pay1     uuid;
  v_status   public.supplier_bill_status;
BEGIN
  INSERT INTO public.suppliers (name)
  VALUES ('SMOKE FIX10 Proveedor')
  RETURNING id INTO v_supplier;

  INSERT INTO public.supplier_bills (supplier_id, subtotal, tax_amount, total, status, approval_status, bill_date)
  VALUES (v_supplier, 1000, 0, 1000, 'pending', 'approved', public.today_mty())
  RETURNING id INTO v_bill;

  INSERT INTO public.supplier_payments (bill_id, payment_date, amount)
  VALUES (v_bill, public.today_mty(), 600) RETURNING id INTO v_pay1;
  INSERT INTO public.supplier_payments (bill_id, payment_date, amount)
  VALUES (v_bill, public.today_mty(), 400);

  PERFORM public.recalc_supplier_bill(v_bill);
  SELECT status INTO v_status FROM public.supplier_bills WHERE id = v_bill;
  PERFORM pg_temp.expect_true('N-3 factura queda en paid con ambos pagos', v_status = 'paid');

  DELETE FROM public.supplier_payments WHERE id = v_pay1;
  PERFORM public.recalc_supplier_bill(v_bill);
  SELECT status INTO v_status FROM public.supplier_bills WHERE id = v_bill;
  PERFORM pg_temp.expect_true('N-3 al reversar un pago vuelve a partial', v_status = 'partial');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  N-3 escenario funcional: %', SQLERRM;
END $$;

ROLLBACK;
