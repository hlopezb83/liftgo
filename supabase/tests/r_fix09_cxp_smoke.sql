-- Smoke SQL de fix-09 (R-1 fecha MTY en pagos a proveedor, R-2 bypass de
-- recalculo en el candado de facturas pagadas).
--   psql -f supabase/tests/r_fix09_cxp_smoke.sql
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

-- 1) R-1: el default del parametro de fecha usa today_mty(), no CURRENT_DATE.
SELECT pg_temp.expect_true(
  'R-1 register_supplier_payment usa today_mty() como default',
  pg_get_functiondef(p.oid) ILIKE '%DEFAULT today_mty()%'
  AND pg_get_functiondef(p.oid) NOT ILIKE '%DEFAULT CURRENT_DATE%'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment';

SELECT pg_temp.expect_true(
  'R-1 el INSERT cae a today_mty() cuando llega NULL',
  pg_get_functiondef(p.oid) ILIKE '%COALESCE(p_payment_date, public.today_mty())%'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment';

-- 2) R-2: el candado honra el bypass de recalculo.
SELECT pg_temp.expect_true(
  'R-2 lock_paid_supplier_bill_with_payments respeta app.cxp_recalc',
  pg_get_functiondef(p.oid) ILIKE '%app.cxp_recalc%'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'lock_paid_supplier_bill_with_payments';

-- 3) R-2 funcional: factura pagada con dos pagos; al borrar uno, el recalculo
--    debe poder bajarla a 'partial' sin que el trigger lance excepcion.
DO $$
DECLARE
  v_supplier uuid;
  v_bill     uuid;
  v_pay1     uuid;
  v_status   public.supplier_bill_status;
BEGIN
  INSERT INTO public.suppliers (name)
  VALUES ('SMOKE FIX09 Proveedor')
  RETURNING id INTO v_supplier;

  -- Canon vigente: una factura de proveedor no puede nacer aprobada; se registra
  -- pendiente y la aprobación se aplica por la vía del RPC (bypass app.cxp_rpc).
  INSERT INTO public.supplier_bills (supplier_id, subtotal, tax_amount, total, status, issue_date)
  VALUES (v_supplier, 1000, 0, 1000, 'pending', public.today_mty())
  RETURNING id INTO v_bill;

  PERFORM set_config('app.cxp_rpc', 'on', true);
  UPDATE public.supplier_bills
     SET approval_status = 'approved', approved_at = now()
   WHERE id = v_bill;
  PERFORM set_config('app.cxp_rpc', 'off', true);

  INSERT INTO public.supplier_payments (bill_id, payment_date, amount)
  VALUES (v_bill, public.today_mty(), 600) RETURNING id INTO v_pay1;
  INSERT INTO public.supplier_payments (bill_id, payment_date, amount)
  VALUES (v_bill, public.today_mty(), 400);

  PERFORM public.recalc_supplier_bill(v_bill);
  SELECT status INTO v_status FROM public.supplier_bills WHERE id = v_bill;
  PERFORM pg_temp.expect_true('R-2 factura queda en paid con ambos pagos', v_status = 'paid');

  DELETE FROM public.supplier_payments WHERE id = v_pay1;
  PERFORM public.recalc_supplier_bill(v_bill);
  SELECT status INTO v_status FROM public.supplier_bills WHERE id = v_bill;
  PERFORM pg_temp.expect_true('R-2 al reversar un pago vuelve a partial', v_status = 'partial');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'FALLO  R-2 escenario funcional: %', SQLERRM;
END $$;

ROLLBACK;
