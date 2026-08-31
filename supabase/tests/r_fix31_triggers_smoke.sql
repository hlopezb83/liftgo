-- Smoke SQL de fix-31 (ronda R6):
--   R6-01 sync_invoice_status(uuid) helper + trigger de NC ampliado
--   R6-07 cruce divisa->MXN permitido en trg_payment_amount_mxn con TC
--   R6-16 trigger de moneda de pagos cubre exchange_rate / amount
--   R6-17 reset de bypass GUC en EXCEPTION
--   R6-20 contratos por vencer sin clientes E2E ni unidades borradas
--   R6-21 desglose de facturas del panel convertido a MXN
--   psql -f supabase/tests/r_fix31_triggers_smoke.sql
-- Solo lecturas de catálogo: no toca datos.

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

-- R6-01: existe el helper y ninguna función de trigger llama a otra
SELECT pg_temp.expect_true(
  'R6-01 existe public.sync_invoice_status(uuid)',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_invoice_status'
      AND pg_get_function_identity_arguments(p.oid) = 'p_invoice_id uuid'
  )
);

SELECT pg_temp.expect_true(
  'R6-01 sync_invoice_status_from_credit_notes ya no llama a la función trigger de pagos',
  pg_temp.fndef('sync_invoice_status_from_credit_notes') NOT LIKE '%sync_invoice_status_from_payments()%'
    AND pg_temp.fndef('sync_invoice_status_from_credit_notes') LIKE '%public.sync_invoice_status(%'
);

SELECT pg_temp.expect_true(
  'R6-01 trigger de NC escucha cfdi_status y cancellation_status',
  (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
    WHERE t.tgname = 'trg_sync_invoice_from_credit_notes' AND NOT t.tgisinternal)
  LIKE '%cfdi_status%cancellation_status%'
);

-- R6-07: cruce permitido si hay TC; RAISE solo cuando no hay ninguno
SELECT pg_temp.expect_true(
  'R6-07 trg_payment_amount_mxn convierte con TC del pago o de la factura',
  pg_temp.fndef('trg_payment_amount_mxn') LIKE '%NULLIF(NEW.exchange_rate, 0), NULLIF(v_tipo_cambio, 0)%'
);

SELECT pg_temp.expect_true(
  'R6-07 el RAISE de moneda quedó condicionado a la ausencia de TC',
  pg_temp.fndef('trg_payment_amount_mxn') LIKE '%IS NULL THEN%RAISE EXCEPTION%'
);

-- R6-16: el trigger cubre exchange_rate (y amount)
SELECT pg_temp.expect_true(
  'R6-16 trg_payments_currency_matches_invoice cubre exchange_rate',
  (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
    WHERE t.tgname = 'trg_payments_currency_matches_invoice' AND NOT t.tgisinternal)
  LIKE '%exchange_rate%'
);

-- R6-17: reset del bypass en EXCEPTION
SELECT pg_temp.expect_true(
  'R6-17 sync_forklift_rental_status resetea app.forklift_rpc en EXCEPTION',
  pg_temp.fndef('sync_forklift_rental_status') LIKE '%EXCEPTION WHEN OTHERS%forklift_rpc%'
);
SELECT pg_temp.expect_true(
  'R6-17 cancel_booking resetea app.forklift_rpc en EXCEPTION',
  pg_temp.fndef('cancel_booking') LIKE '%EXCEPTION WHEN OTHERS%forklift_rpc%'
);
SELECT pg_temp.expect_true(
  'R6-17 create_booking resetea booking_rpc y forklift_rpc',
  pg_temp.fndef('create_booking') LIKE '%EXCEPTION WHEN OTHERS%booking_rpc%'
    AND pg_temp.fndef('create_booking') LIKE '%EXCEPTION WHEN OTHERS%forklift_rpc%'
);
SELECT pg_temp.expect_true(
  'R6-17 complete_return_inspection resetea los bypass',
  pg_temp.fndef('complete_return_inspection') LIKE '%EXCEPTION WHEN OTHERS%booking_rpc%'
);
SELECT pg_temp.expect_true(
  'R6-17 e2e_seed_portal_scenario activa app.e2e_seed sólo dentro de la transacción',
  pg_temp.fndef('e2e_seed_portal_scenario') LIKE '%set_config(''app.e2e_seed'', ''on'', true)%'
);

-- R6-20: filtros de contratos por vencer sin perder contratos sin unidad
SELECT pg_temp.expect_true(
  'R6-20 expiring_contracts excluye clientes E2E',
  pg_temp.fndef('get_financial_kpis') LIKE '%cu.is_e2e IS NOT TRUE%'
);
SELECT pg_temp.expect_true(
  'R6-20 expiring_contracts conserva contratos sin unidad (LEFT JOIN)',
  pg_temp.fndef('get_financial_kpis') LIKE '%(f.id IS NULL OR f.deleted_at IS NULL)%'
);
SELECT pg_temp.expect_true(
  'R6-20 no se perdió el FIX A4 (MRR convertido a MXN)',
  pg_temp.fndef('get_financial_kpis') LIKE '%NULLIF(b.tipo_cambio, 0)%'
);

-- R6-21: desglose del panel en MXN, conservando FIX A1
SELECT pg_temp.expect_true(
  'R6-21 el desglose de facturas convierte a MXN',
  pg_temp.fndef('get_dashboard_stats') LIKE '%as sum_total%'
    AND pg_temp.fndef('get_dashboard_stats') LIKE '%total * tipo_cambio%'
);
SELECT pg_temp.expect_true(
  'R6-21 no se perdió el FIX A1 (v_invoice_forklift_revenue)',
  pg_temp.fndef('get_dashboard_stats') LIKE '%v_invoice_forklift_revenue%'
);

ROLLBACK;
