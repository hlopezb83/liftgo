-- Smoke SQL del cierre de sprints (Fix 3.2, 3.4 y 8.5).
-- Ejecutar manualmente contra staging:
--   psql -f supabase/tests/sprint3_8_cierre_smoke.sql
-- Solo lecturas: inspecciona catálogo y cuerpos de funciones, no modifica datos.

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

-- Fix 3.2: los pagos deben coincidir con la moneda de la factura.
SELECT pg_temp.expect_true(
  'S3-3.2 trigger de moneda de pago instalado en payments',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'payments'
      AND p.proname = 'enforce_payment_matches_invoice_currency'
      AND NOT t.tgisinternal
  )
);

-- Fix 3.4: ningún pago puede exceder el total de la factura.
SELECT pg_temp.expect_true(
  'S3-3.4 trigger anti-sobrepago instalado en payments',
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'payments'
      AND p.proname IN ('enforce_payment_within_invoice_total', 'enforce_payment_balance')
      AND NOT t.tgisinternal
  )
);

-- Fix 8.5: la inspección de retorno calcula el exceso de horas.
SELECT pg_temp.expect_true(
  'S8-8.5 return_inspections tiene extra_hours',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'return_inspections' AND column_name = 'extra_hours'
  )
);

SELECT pg_temp.expect_true(
  'S8-8.5 return_inspections tiene suggested_extra_hour_charge',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'return_inspections'
      AND column_name = 'suggested_extra_hour_charge'
  )
);

SELECT pg_temp.expect_true(
  'S8-8.5 complete_return_inspection usa extra_hour_rate del contrato',
  (SELECT prosrc FROM pg_proc WHERE proname = 'complete_return_inspection') ILIKE '%extra_hour_rate%'
);

SELECT pg_temp.expect_true(
  'S8-8.5 complete_return_inspection usa max_hours_per_month del contrato',
  (SELECT prosrc FROM pg_proc WHERE proname = 'complete_return_inspection') ILIKE '%max_hours_per_month%'
);

-- Guardas de seguridad exigidas por las reglas permanentes de migraciones.
SELECT pg_temp.expect_true(
  'S8-8.5 complete_return_inspection es SECURITY DEFINER con search_path fijo',
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'complete_return_inspection'
      AND prosecdef
      AND array_to_string(proconfig, ',') ILIKE '%search_path%'
  )
);

SELECT pg_temp.expect_true(
  'S8-8.5 complete_return_inspection valida roles',
  (SELECT prosrc FROM pg_proc WHERE proname = 'complete_return_inspection') ILIKE '%has_role%'
);

ROLLBACK;
