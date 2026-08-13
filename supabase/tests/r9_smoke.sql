-- Smoke SQL de la Ronda 9 (familia de zona horaria + trazabilidad de rechazo).
-- Ejecutar manualmente contra staging:
--   psql -f supabase/tests/r9_smoke.sql
-- No deja datos: todo corre dentro de una transaccion con ROLLBACK.

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

-- 1) today_mty() existe y es la fuente unica de "hoy" en Monterrey.
SELECT pg_temp.expect_true(
  'R9-01 today_mty() existe',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'today_mty')
);

SELECT pg_temp.expect_true(
  'R9-01 today_mty() = fecha en America/Monterrey',
  public.today_mty() = (now() AT TIME ZONE 'America/Monterrey')::date
);

-- 2) today_mty() y CURRENT_DATE (UTC) difieren en la ventana nocturna:
--    ese desfase era el origen de "Cartera Vencida $0" de madrugada.
SELECT pg_temp.expect_true(
  'R9-01 desfase UTC vs Monterrey acotado a 1 dia',
  public.today_mty() BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE
);

-- 3) Ninguna funcion de negocio debe seguir usando CURRENT_DATE / now()::date.
--    Se excluyen las funciones de semilla/limpieza E2E.
DO $$
DECLARE v_names text;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ')
    INTO v_names
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname NOT LIKE 'e2e\_%'
     AND p.proname <> 'today_mty'
     AND p.prosrc ~* '(current_date|now\(\)::date)';
  IF v_names IS NULL THEN
    RAISE NOTICE 'OK  R9-02 sin CURRENT_DATE en funciones de negocio';
  ELSE
    RAISE WARNING 'FALLO  R9-02 funciones con CURRENT_DATE: %', v_names;
  END IF;
END $$;

-- 4) La vista de cartera vencida se apoya en today_mty().
SELECT pg_temp.expect_true(
  'R9-02 v_overdue_invoices usa today_mty()',
  EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'v_overdue_invoices'
      AND definition ILIKE '%today_mty%'
  )
);

-- 5) Trazabilidad del rechazo de cotizaciones (R9-P2-01).
SELECT pg_temp.expect_true(
  'R9-P2-01 quotes.rejected_at existe',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'rejected_at'
  )
);

SELECT pg_temp.expect_true(
  'R9-P2-01 no hay cotizaciones rechazadas sin fecha de rechazo',
  NOT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE status = 'rejected' AND rejected_at IS NULL
      AND updated_at > now() - interval '30 days'
      AND COALESCE(is_e2e, false) = false
  )
);

-- 6) Consistencia de CxP (R9-P2-02): una factura pagada o cancelada no puede
--    seguir en aprobacion 'pending'.
SELECT pg_temp.expect_true(
  'R9-P2-02 sin CxP pagada/cancelada en aprobacion pendiente',
  NOT EXISTS (
    SELECT 1 FROM public.supplier_bills
    WHERE status IN ('paid', 'cancelled') AND approval_status = 'pending'
  )
);

ROLLBACK;
